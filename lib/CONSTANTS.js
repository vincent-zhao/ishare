var ZooKeeper = require('zookeeper');

module.exports = {
  //zk default order
  'HOST_ORDER'   : false,
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

  //how long between two service check
  'CHECK_TM'     : 1000,
}
