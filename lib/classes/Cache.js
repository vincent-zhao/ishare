/**
 * cache静态对象
 * author : yixuan
 * mail : yixuan.zzq@taobao.com
 */

var fs        = require('fs');
var tools     = require('../tools');
var CONSTANTS = require('../CONSTANTS');

var cache = {
  'service' : {},
  'app'     : {}
};
var path;
var load = false;

exports.init = function (p) {
  path = p;
}

exports.getCacheObject = function () {

  var _me = {};

  /*{{{ setServiceCache()*/
  _me.setServiceCache = function (key, val) {
    if (cache['service'][key] === undefined) {
      cache['service'][key] = {}
    }
    var tmp = tools.objectClone(cache);
    tmp['service'][key] = tools.objectClone(val);
    writeCache(tmp);
    cache['service'][key] = tools.objectClone(val);
  }
  /*}}}*/

  /*{{{ getServiceCache()*/
  _me.getServiceCache = function (key) {
    if (key === undefined) {
      return tools.objectClone(cache['service']);
    }
    return tools.objectClone(cache['service'][key]);
  }
  /*}}}*/

  /*{{{ setAppCache()*/
  _me.setAppCache = function (key, val) {
    if (cache['app'][key] === undefined) {
      cache['app'][key] = {}
    }
    var tmp = tools.objectClone(cache);
    tmp['app'][key] = tools.objectClone(val);
    writeCache(tmp);
    cache['app'][key] = tools.objectClone(val);
  }
  /*}}}*/

  /*{{{ getAppCache()*/
  _me.getAppCache = function (key) {
    if (key === undefined) {
      return tools.objectClone(cache['app']);
    }
    return tools.objectClone(cache['app'][key]);
  }
  /*}}}*/

  /*{{{ delAppCache()*/
  _me.delAppCache = function (key) {
    var tmp = tools.objectClone(cache);
    delete tmp['app'][key];
    writeCache(tmp);
    delete cache['app'][key];
  }
  /*}}}*/

  /*{{{ loadCache()*/
  _me.loadCache = function () {
    cache = {
      'service' : {},
      'app'     : {}
    };

    var splits = path.split('/');
    var prefix = splits.pop();
    var dir    = splits.join('/');
    var files  = fs.readdirSync(dir);

    var serviceCacheMap = {};
    var appCacheMap = {};
    var pattern  = new RegExp('^' + prefix + CONSTANTS.SEP,'i');
    for (var i = 0;i < files.length; i++) {
      if (!pattern.test(files[i])) {
        continue;
      }

      var get;
      try {
        get = JSON.parse(fs.readFileSync(dir + '/' + files[i]));
      } catch(e) {
        continue;
      }

      for (var j in get['service']) {
        if (serviceCacheMap[j] === undefined) {
          serviceCacheMap[j] = [];
        }
        serviceCacheMap[j].push(get['service'][j]);
      }

      for (var j in get['app']) {
        if (appCacheMap[j] === undefined || get['app'][j].version > appCacheMap[j].version) {
          appCacheMap[j] = get['app'][j];
        }
      }
    }
    cache['app'] = appCacheMap;

    for (var i in serviceCacheMap) {
      var arr = serviceCacheMap[i];
      var res = [];
      for (var j = 0;j < arr.length; j++) {
        for (var l = 0;l < arr[j].length; l++) {
          var exist = false;
          for (var k in res) {
            if (res[k].addr === arr[j][l].addr) {
              exist = true;
            }
          }
          if (!exist) {
            res.push(arr[j][l]);
          }

        }
      }
      cache['service'][i] = res;
    }
    load = true;
  }
  /*}}}*/

  /*{{{ isLoaded()*/
  _me.isLoaded = function(){
    return load;
  }
  /*}}}*/

  /*{{{ clean()*/
  _me.clean = function () {
    cache = {
      'service' : {},
      'app'     : {}
    };
    load = false;
  }
  /*}}}*/

  return _me;

}

/*{{{ cleanOldCache()*/
exports.cleanOldCache = function(){
  var splits = path.split('/');
  var prefix = splits.pop();
  var dir    = splits.join('/');
  var files  = fs.readdirSync(dir);

  var pattern  = new RegExp('^' + prefix + CONSTANTS.SEP,'i');
  for (var i = 0;i < files.length; i++) {
    if (!pattern.test(files[i])) {
      continue;
    }

    var filePath = dir + '/' + files[i];
    try {
      var timeInterval = Date.now() - Date.parse(fs.statSync(filePath).mtime);
      if( timeInterval > CONSTANTS.FILE_TIME_INTERVAL){
        fs.unlinkSync(filePath);
      }
    } catch(e) {}
  }
}
/*}}}*/

/*{{{ writeCache()*/
function writeCache (saveCache) {
  fs.writeFileSync(path + CONSTANTS.SEP + process.pid, JSON.stringify(saveCache));
}
/*}}}*/

