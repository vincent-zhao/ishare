/**
 * 常量池
 * author : yixuan
 * mail : yixuan.zzq@taobao.com
 */

var ZooKeeper = require('zookeeper');

module.exports = {
  //zk default order
  'HOST_ORDER'     : false,
  //default timeout(ms)
  'DEFAULT_TM'     : 1000,
  //version node type
  'VER_NODE_TYPE'  : 0,
  //service node type
  'REG_NODE_TYPE'  : ZooKeeper.ZOO_EPHEMERAL,
  //info node type
  'INFO_NODE_TYPE' : 0,

  //zk obj state
  'ZK_NOT_OK'   : 0,
  'ZK_WAITING'  : 1,
  'ZK_OK'       : 2,

  //set version param
  'SET_VERSION'  : 0,

  //param for getting recent version
  'RECENT'       : '0',

  //default cache path
  'DEFAULT_PATH' : './.cache',

  //service root
  'SERVICE_ROOT' : 'service',

  //app root
  'APP_ROOT'     : 'app',

  'SEP' : '-',

  //file check interval(ms)
  'FILE_TIME_INTERVAL' : 1000*60*60*24

}
