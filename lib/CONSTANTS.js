var ZooKeeper = require('zookeeper');

module.exports = {
  //zk default order
  'HOST_ORDER'   : false,
  //defualt timeout
  'DEFAULT_TM'   : 2000,
  //version node type
  'VER_NODE_TYPE': 0,
  //service node type
  'REG_NODE_TYPE': ZooKeeper.ZOO_EPHEMERAL,

  //delete version param
  'DEL_VERSION'  : 0,
  //set version param
  'SET_VERSION'  : 0,

  //param for getting recent version
  'RECENT'       : '0',

  //how long waiting for check back
  'CHECK_TM'     : 2000,

  //default cache path
  'DEFAULT_PATH' : './.cache',

  //service root
  'SERVICE_ROOT' : 'service'
}
