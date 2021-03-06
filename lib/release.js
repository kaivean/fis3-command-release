/* eslint-disable */
/*
 * @file 暂无更改
 * @author
 */
var chalk = require('chalk');
var time = require('./time.js');
var stream = process.stdout;
var _ = fis.util;
var lastModified = {};

process.on('exit', function() {
  console.log();
});

function duration(ms) {
  return ms > 999 ? ((ms / 1000).toFixed(2) + 's') : (ms + 'ms');
}

function release(options, next) {
  !options.silent && stream.write('\n Ω '.green.bold);
  var verbose = options.verbose;

  var alertDurtion = 1000; // 1s
  var alertCacheDurtion = 200; // 200ms

  var total = options.total || {};
  var modified = {};

  options.beforeEach = function(file) {
    if (file.isPartial)return;
    file._start = Date.now(); // 记录起点
    file.release !== false && (total[file.subpath] = file);
    file._fromCache = true;
  };

  options.beforeCompile = function(file) {
    if (file.isPartial)return;
    file._fromCache = false;
    file.release !== false && (modified[file.subpath] = file);
  };

  options.afterEach = function(file) {
    if (file.isPartial)return;
    var mtime = file.getMtime().getTime();
    var fromCache = file._fromCache;

    if (file.release && (!fromCache || lastModified[file.subpath] !== mtime)) {
      var cost = Date.now() - file._start;
      var flag = fromCache ? (cost > alertCacheDurtion ? '.'.bold.yellow : '.'.grey) : (cost > alertDurtion ? '.'.bold.yellow : '.');

      lastModified[file.subpath] = mtime;
      modified[file.subpath] = file;
      if (!options.silent) {
        verbose ? fis.log.debug(file.realpath) : stream.write(flag);
      }
    }
  };

  // 更改： 抛出错误，而非退出
  var onError = function(e) {
    fis.emit('release:error', e);
    // process.stdout.write('\n [ERROR] ' + (e.message || e) + '\n');
    fis.log.debug(e.stack);
    if (options.watch) {
      // 更改：不能使用throw e 导致next不执行，后续watch失效
      console.log(chalk.red(e.stack));
      // process.stdout.write('\u0007');
    } else if (options.verbose) {
      throw e;
    } else {
      // 更改：不退出
      throw e;
      // process.exit(1);
    }
    next(e);
  }

  try {
    var start = Date.now();
    fis.log.throw = true;

    // release
    fis.release(options, function(ret) {
      !options.silent && stream.write(fis.log.format('%s%s'.bold.green, verbose ? '' : ' ', duration(Date.now() - start)));

      // clear cache
      options.unique && time(fis.compile.clean);

      var totalBeforePack = _.assign({}, total);
      _.map(ret.pkg, function(subpath, file) {
        modified[subpath] = file;
        total[subpath] = file;
      });

      next(null, {
        options: options,
        modified: modified,
        total: total,
        totalBeforePack: totalBeforePack
      });
    }, onError);
  } catch (e) {
    onError(e);
  }
}

module.exports = release;
