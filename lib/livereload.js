/* eslint-disable */
/*
 * @file 更改rLivereload、 由配置传入端口不用端口自动发现
 * @author
 */
var _ = fis.util;
var portfinder = require('portfinder');
// 更改：此处只替换 <!--livereload-->
var rLivereload = /<!--livereload-->/ig;
var LRServer;
var LRPORT;

var defaultHostname = (function() {
  var ip = false;
  var net = require('os').networkInterfaces();

  /*
	获取fis-config.js中配置的默认host规则，可以是字符串或正则，字符串中 * 可以代表任意数字。
	使用示例：fis.config.set('livereload-iprule', '192.168.*.*')
	适用场景：机器上安装虚拟机后，会有很多虚拟网卡，默认获取的ip在局域网中访问不到，手机调试时加载不了。
  */
  var iprule = fis.config.get('livereload-iprule');
  if(iprule && typeof(iprule) === 'string'){
	  iprule = new RegExp('^' + iprule.replace(/\.|\*/g, function(v){
		  return v === '.'? '\\\.' : '\\\d+'
	  }) + '$');
  }else if(!(iprule instanceof RegExp)){
	  iprule = /^\d+(?:\.\d+){3}$/;
  }
  Object.keys(net).every(function(key) {
    var detail = net[key];
    Object.keys(detail).every(function(i) {
      var address = String(detail[i].address).trim();
      if (address && iprule.test(address)) {
        ip = address;
      }
      return !ip; // 找到了，则跳出循环
    });
    return !ip; // 找到了，则跳出循环
  });
  return ip || '127.0.0.1';
})();

function makeLiveServer(callback) {
  if (LRServer) return callback(null, LRServer, LRPORT);

  // var basePort = fis.media().get('livereload.port', 8132);

  // 更改：此处只用传入端口
  // 获取下一个可用端口。
  // portfinder.getPort({
  //   port: basePort
  // }, function(error, port) {
    // if (error) {
    //   fis.log.warn('The port %s for livereload is already in use!', basePort);
    //   return callback(error);
    // }

    let port = LRPORT;

    /**
     * HACK: 给 process 挂载一个 EventEmitter 若不存在
     * 防止 livereload-server-spec 包依赖的 websocket.io-spec 包运行报错
     *
     * process.EventEmitter 于 node 6.0.0 开始过时（nodejs/node#5049）
     * process.EventEmitter 于 node 7.0.0 开始移除（nodejs/node#6862）
     *
     * require('events') 于 io.js 1.0.1 开始直接返回 EventEmitter
     * 所以可以安全使用 require('events') 挂载 EventEmitter
     */
    if (!('EventEmitter' in process)) {
      process.EventEmitter = require('events')
    }

    var LiveReloadServer = require('livereload-server-spec');

    fis.LRServer = LRServer = new LiveReloadServer({
      id: 'com.baidu.fis',
      name: 'fis-reload',
      version: fis.cli.info.version,
      port: port,
      protocols: {
        monitoring: 7
      }
    });

    LRServer.on('livereload.js', function(req, res) {
      var script = fis.util.fs.readFileSync(__dirname + '/../vendor/livereload.js');
      res.writeHead(200, {
        'Content-Length': script.length,
        'Content-Type': 'text/javascript',
        'Connection': 'close'
      });
      res.end(script);
    });
    LRServer.listen(function(err) {
      if (err) {
        err.message = 'LiveReload server Listening failed: ' + err.message;
        fis.log.error(err);
      }
    });

    // 注释： 增加Live Port
    process.stdout.write('\n Ψ Live Port: '.bold.yellow + port + '\n');

    // fix mac livereload， 后续由ala.js统一捕获错误
    // process.on('uncaughtException', function(err) {
    //     if (err.message !== 'read ECONNRESET') throw err;
    // });


    callback(null, LRServer, LRPORT);
  // });
}

function reload(callback) {
  makeLiveServer(function(error, server) {
    if (error) {
      return callback(error);
    }

    if (server && server.connections) {
      _.map(server.connections, function(id, connection) {
        try {
          connection.send({
            command: 'reload',
            path: '*',
            liveCSS: true
          });
        } catch (e) {
          try {
            connection.close();
          } catch (e) {}
          delete server.connections[id];
        }
      });
    }

    callback(null);
  });
}

function handleReloadComment(obj, next) {
  var isLiveMod = obj.options.live;
  LRPORT = obj.options.livePort;
  fis.log.debug('handle reload comment start');

  if (isLiveMod) {
    makeLiveServer(function(error, server, port) {
      if (error) {
        return next(error);
      }

      _.toArray(obj.modified).forEach(function(file) {
        var content = file.getContent();
        if (!file.isHtmlLike || typeof content !== 'string') {
          return;
        }

        rLivereload.lastIndex = 0;
        content = content.replace(rLivereload, function(all, token) {
          if (token) {
            var hostname = fis.config.get('livereload.hostname', defaultHostname);

            all = '<script type="text/javascript" charset="utf-8" src="http://' + hostname + ':' + port + '/livereload.js"></script>' + token;
          }

          return all;
        });

        file.setContent(content);
      });

      fis.log.debug('handle reload comment end');
      next(null, obj);
    });
  } else {
    _.toArray(obj.modified).forEach(function(file) {
      var content = file.getContent();

      if (!file.isHtmlLike || typeof content !== 'string') {
        return;
      }

      content = content.replace(/<!--livereload-->/ig, '');
      file.setContent(content);
    });

    fis.log.debug('handle reload comment end');
    next(null, obj);
  }


};

function checkReload(obj, next) {
  LRPORT = obj.options.livePort;
  reload(function() {
    next(null, obj)
  });
}

exports.checkReload = checkReload;
exports.handleReloadComment = handleReloadComment;
