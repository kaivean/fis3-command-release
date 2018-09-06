/* eslint-disable */
/*
 * @file 暂无更改
 * @author
 */
var _ = fis.util;
var path = require('path');
var watch = require('./lib/watch.js');
var release = require('./lib/release.js');
var deploy = require('./lib/deploy.js');
var livereload = require('./lib/livereload.js');
var time = require('./lib/time.js');
var checkIgnore = require('./lib/checkignore.js');

exports.name = 'release [media name]';
exports.desc = 'build and deploy your project';
exports.options = {
  '-h, --help': 'print this help message',
  '-d, --dest <path>': 'release output destination',
  '-l, --lint': 'with lint',
  '-w, --watch': 'monitor the changes of project',
  '-L, --live': 'automatically reload your browser',
  '-c, --clean': 'clean compile cache',
  '-u, --unique': 'use unique compile caching',
  '-r, --root <path>': 'specify project root',
  '-f, --file <filename>': 'specify the file path of `fis-conf.js`',
  '--no-color': 'disable colored output',
  '--verbose': 'enable verbose mode'
};

// 更改：去掉命令参数，增加callback控制过程
exports.run = function (argv, callback) {

  // 显示帮助信息
  // if (argv.h || argv.help) {
  //   return cli.help(exports.name, exports.options);
  // }

  // validate(argv);

  // normalize options
  var options = {
    dest: argv.dest || argv.d || 'preview',
    watch: !!(argv.watch || argv.w),
    live: !!(argv.live || argv.L),
    clean: !!(argv.clean || argv.c),
    unique: !!(argv.unique || argv.u),
    useLint: !!(argv.lint || argv.l),
    verbose: !!argv.verbose
  };
  options = Object.assign(options, argv);

  // enable watch automatically when live is enabled.
  options.live && (options.watch = true);

  var app = require('./lib/chains.js')();

  app.use(function (options, next) {

    // clear cache?
    if (options.clean) {
      time(function () {
        fis.cache.clean('compile');
      });
    }
    // 更改：不需要该功能
    // else if (env.configPath) {
    //   // fis-conf 失效？
    //   var cache = fis.cache(env.configPath, 'conf');
    //   if(!cache.revert()){
    //     cache.save();
    //     time(function() {
    //       fis.cache.clean('compile');
    //     });
    //   }
    // }

    next(null, options);
  });

  // watch it?
  options.watch && app.use(watch);
  app.use(release);

  // 处理 livereload 脚本
  app.use(livereload.handleReloadComment);

  // deliver
  app.use(function (info, next) {
    fis.log.debug('deploy start');
    deploy(info, function (error) {
      fis.log.debug('deploy end');
      next(error, info);
    });
  });

  options.live && app.use(livereload.checkReload);

  // output fix
  if (_.is(options['dest'], 'String')) {
    var root = fis.project.getProjectPath();
    var dest = path.resolve(root, options['dest']);
    var isInRoot = dest.indexOf(root) === 0;

    if (isInRoot && !checkIgnore(dest.substring(root.length)) && _.exists(dest)) {
      fis.log.warn('skip `output` directory: ' + dest);

      // maybe fis.set('project.ignore', 'node_modules/**');
      if (!_.is(fis.get('project.ignore'), 'Array')) {
        fis.set('project.ignore', [fis.get('project.ignore')]);
      }

      fis.set(
        'project.ignore',
        fis.get('project.ignore').concat(
          [dest.replace(root + '/', '') + '/**']
        )
      );
    }
  }

  app.use(function (info, next) {
    options.afterReleased && options.afterReleased(info); // 更改： 每次构建完成，执行一次，watch情况下每个改动构建后也会执行
    next(null, info);
    // deploy(info, function (error) {
    //   fis.log.debug('deploy end');
    //   next(error, info);
    // });
  });

  // run it.
  app.run(options);

};

function validate(argv) {
  if (argv._.length > 2) {
    fis.log.error('Unregconized `%s`, please run `%s release --help`', argv._.slice(2).join(' '), fis.cli.name);
  }

  var allowed = ['_', 'dest', 'd', 'lint', 'l', 'watch', 'w', 'live', 'L', 'clean', 'c', 'unique', 'u', 'verbose', 'color', 'root', 'r', 'f', 'file', 'child-flag'];

  Object.keys(argv).forEach(function (k) {
    if (!~allowed.indexOf(k)) {
      fis.log.error('The option `%s` is unregconized, please run `%s release --help`', k, fis.cli.name);
    }
  });
}
