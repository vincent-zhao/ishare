/**
 * 工具库
 * author : yixuan
 * mail : yixuan.zzq@taobao.com
 */

/*{{{ max() */
/**
 * 取最大值
 * @param {Array} elements 数组
 */
function max(elements) {
  var m = '';
  for (var i in elements) {
    if (elements[i] > m) {
      m = elements[i];
    }
  }
  return m;
}
exports.max = max;
/*}}}*/

/*{{{ isDiff() */
/**
 * 判断两个数列是否一样
 * @param {Array} list1 数列1
 * @param {Array} list2 数列2
 * @return {boolean} 是否一样
 */
function isDiff(list1, list2) {
  if (list1.length !== list2.length) {
    return true;
  }

  for (var i = 0;i < list1.length; i++) {
    var exist = false;
    for (var j = 0;j < list2.length; j++) {
      if (list1[i] === list2[j]) {
        exist = true;
      }
    }
    if (!exist) {
      return true;
    }
  }
  return false;
}
exports.isDiff = isDiff;
/*}}}*/

/*{{{ exist()*/
/**
 * 判断列表中是否存在某个元素
 * @param {Array} list 列表
 * @param {Unknown} one 元素
 * @return {boolean} 是否存在
 */
function exist(list, one) {
  for (var i in list) {
    if (list[i] === one) {
      return true;
    }
  }
  return false;
}
exports.exist = exist
/*}}}*/

/*{{{ merge()*/
function merge(arr) {
  var list = [];
  for (var i = 0;i < arr.length; i++) {
    for (var j = 0;j < arr[i].length; j++) {
      list.push(arr[i][j]);
    }
  }
  return list;
}
exports.merge = merge;
/*}}}*/

/*{{{ objectClone()*/
/**
 * 对象复制
 * @param {object} obj 对象
 * @param {object} 复制出的对象
 */
function objectClone(obj) { 
  var _type = typeof(obj);
  if ('object' == _type && null !== obj) {
    var _me = Array.isArray(obj) ? [] : {};
    for (var i in obj) {
      _me[i] = objectClone(obj[i]);
    }
    return _me;
  }

  return obj;
}
exports.objectClone = objectClone;
/*}}}*/
