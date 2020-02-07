/***
 * Copyright (c) 2015 - 2020 Alex Grant (@localnerve), LocalNerve LLC
 * Licensed under the MIT license.
 *
 * tests.
 */
/* global require, describe, it, after, before, beforeEach */
/* eslint-disable no-console */
'use strict';

const expect = require('chai').expect;
const spawn = require('child_process').spawn;
const path = require('path');
const rimraf = require('rimraf');
const fs = require('fs');
const picklr = require('../../lib/picklr');

describe('picklr', () => {
  const startDir = path.join(__dirname, '../fixtures'),
    totalJSFiles = 7,
    totalSCSSFiles = 11,
    totalJSXFiles = 22;
  let totalCount,
    matchedCount,
    foundText,
    replaceText,
    omitText,
    updateText;

  function getCounts (text) {
    let m;
    if (text.indexOf('Matched file count') > -1) {
      m = text.match(/Matched.+=\s*(\d+)/i);
      matchedCount = parseInt(m && m[1] || 0, 10);
    }
    if (text.indexOf('Total file count') > -1) {
      m = text.match(/Total.+=\s*(\d+)/i);
      totalCount = parseInt(m && m[1] || 0, 10);
    }
  }

  function getAudits (text) {
    let m;
    if (text.indexOf('@@@') === 0) {
      m = text.match(/\@\@\@\s*Found\:\s*(.+)/i);
      if (m && m[1]) {
        foundText.push(m[1]);
      }
    }
    if (text.indexOf('---') === 0) {
      m = text.match(/\-\-\-\s*Change\:\s*(.+)/i);
      if (m && m[1]) {
        replaceText.push(m[1]);
      }
    }
    if (text.indexOf('***') === 0) {
      m = text.match(/\*\*\*\s*Omitted\:\s*(.+)/i);
      if (m && m[1]) {
        omitText.push(m[1]);
      }
    }
  }

  function getUpdates (text) {
    let m;
    if (text.indexOf('@@@') === 0) {
      m = text.match(/\@\@\@\s*Updated:\s*(.+)/i);
      if (m && m[1]) {
        updateText.push(m[1]);
      }
    }
  }

  beforeEach(() => {
    foundText = [];
    replaceText = [];
    omitText = [];
    updateText = [];
    matchedCount = 0;
    totalCount = 0;
  });

  describe('echo', () => {
    it('should echo js test files by default', () => {
      picklr(startDir, {
        logger: getCounts
      });

      expect(totalCount).to.equal(totalJSFiles);
    });

    describe('includeExts', () => {
      it('should count only scss files', () => {
        picklr(startDir, {
          includeExts: ['.scss'],
          logger: getCounts
        });

        expect(totalCount).to.equal(totalSCSSFiles);
      });

      it('should count only jsx and scss files', () => {
        picklr(startDir, {
          includeExts: ['.jsx', '.scss'],
          logger: getCounts
        });

        expect(totalCount).to.equal(totalJSXFiles + totalSCSSFiles);
      });

      it('should count all fixture files', () => {
        picklr(startDir, {
          includeExts: ['.js', '.jsx', '.scss'],
          logger: getCounts
        });

        expect(totalCount).to.equal(totalJSFiles + totalJSXFiles + totalSCSSFiles);
      });
    });

    describe('excludeDirsRe', () => {
      const totalJSFilesWoWorkit = totalJSFiles - 2;

      it('should exclude directories', () => {
        picklr(startDir, {
          includeExts: ['.js'],
          excludeDirsRe: /\/\.|workit/i,
          logger: getCounts
        });

        expect(totalCount).to.equal(totalJSFilesWoWorkit);
      });

      it('should exclude a directory recursively', () => {
        picklr(startDir, {
          includeExts: ['.js'],
          excludeDirsRe: /\/\.|1/i,
          logger: getCounts
        });

        expect(totalCount).to.equal(3);
      });

      it('should exclude multiple directories', () => {
        picklr(startDir, {
          includeExts: ['.js'],
          excludeDirsRe: /\/\.|1|2|workit/i,
          logger: getCounts
        });

        expect(totalCount).to.equal(1);
      });
    });
  });

  describe('audit', () => {
    const workit = path.join(startDir, 'files', 'workit');
    const backup = path.join(startDir, 'files', 'workitbackup');

    before('audit', (done) => {
      const cp = spawn('cp', ['-r', workit, backup]);
      cp.on('close', (code) => {
        let exists = false, stats;
        if (code === 0) {
          stats = fs.statSync(backup);
          exists = stats && stats.isDirectory();
        }
        done(code === 0 && exists ? null : new Error('cp failed, code '+ code));
      });
    });

    after('audit', (done) => {
      rimraf(backup, done);
    });

    it('should not update files', () => {
      picklr(workit, {
        action: 'audit',
        targetText: 'this is a test',
        includeExts: ['.txt'],
        logger: getCounts
      });

      expect(totalCount).to.equal(1);
      expect(matchedCount).to.equal(1);

      const auditedFile =
        fs.readFileSync(path.join(workit, 'sentinel.txt'), {encoding: 'utf8'});
      const cleanFile =
        fs.readFileSync(path.join(backup, 'sentinel.txt'), {encoding: 'utf8'});
      expect(auditedFile).to.equal(cleanFile);
    });

    it('should report the proposed update', () => {
      picklr(workit, {
        action: 'audit',
        targetText: '88888888',
        replacementText: '9',
        includeExts: ['.txt'],
        logger: getAudits
      });

      expect(foundText.length).to.equal(1);
      expect(replaceText.length).to.equal(1);
      expect(foundText[0]).to.contain('88888888');
      expect(replaceText[0]).to.contain('9').and.not.contain('8');
    });

    it('should report omitted files', () => {
      picklr(workit, {
        action: 'audit',
        targetText: '88888888',
        replacementText: '9',
        includeExts: ['.txt', '.scss'],
        excludeDirsRe: /1|2/,
        logger: getAudits
      });

      expect(foundText.length).to.equal(1);
      expect(replaceText.length).to.equal(1);
      expect(omitText.length).to.equal(1);
      expect(foundText[0]).to.contain('88888888');
      expect(replaceText[0]).to.contain('9').and.not.contain('8');
      expect(omitText[0]).to.contain('.scss');
    });
  });

  describe('update', () => {
    const workit = path.join(startDir, 'files', 'workit');
    const update = path.join(startDir, 'files', 'workitupdate');

    before('update', (done) => {
      const cp = spawn('cp', ['-r', workit, update]);
      cp.on('close', (code) => {
        let exists = false, stats;
        if (code === 0) {
          stats = fs.statSync(update);
          exists = stats && stats.isDirectory();
        }
        done(code === 0 && exists ? null : new Error('cp failed, code '+ code));
      });
    });

    after('update', (done) => {
      rimraf(update, done);
    });

    it('should update only the found file', () => {
      let cleanFile, shouldBeCleanFile;

      picklr(update, {
        action: 'update',
        targetText: '88888888',
        replacementText: '9',
        includeExts: ['.txt', '.scss'],
        excludeDirsRe: /1|2/,
        logger: getUpdates
      });

      expect(updateText.length).to.equal(1);
      expect(updateText[0]).to.contain('.txt').and.not.contain('.scss');

      cleanFile =
        fs.readFileSync(path.join(workit, '_app.scss'), {encoding: 'utf8'});
      shouldBeCleanFile =
        fs.readFileSync(path.join(update, '_app.scss'), {encoding: 'utf8'});
      expect(cleanFile).to.equal(shouldBeCleanFile);

      cleanFile =
        fs.readFileSync(path.join(workit, 'sentinel.txt'), {encoding: 'utf8'});
      const updatedFile =
        fs.readFileSync(path.join(update, 'sentinel.txt'), {encoding: 'utf8'});
      expect(cleanFile).to.not.equal(updatedFile);
      expect(updatedFile).to.contain('9').and.not.contain('8');
    });
  });
});
