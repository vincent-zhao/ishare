/**
 * 自定义Error类
 * author : yixuan
 * mail : yixuan.zzq@taobao.com
 */

module.exports = function (name, message) {
  this.name    = name;
  this.message = message;
}
