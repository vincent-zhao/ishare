var should    = require('should');
var http      = require('http');
var fs        = require('fs');
var exec      = require('child_process').exec;
var util      = require('util');
var EventEmitter = require('events').EventEmitter;
var Zookeeper = require('zookeeper');
var testConf  = require(__dirname+'/etc/test_config');
var iShare    = require(__dirname+'/../lib/client').createClient(testConf);
var CONSTANTS = require(__dirname+'/../lib/CONSTANTS');

var serviceNode = 'a.b.c.d.testService';

var zk;

describe('iShare test',function(){

  /*{{{ before */
  before(function(done){
    
    var ports = [9111,9112,9113,9114,9115];
    createServers(ports,function(){
      zk = new Zookeeper({
        connect : testConf.zookeeper,
        timeout : 10000
      });
      
      zk.connect(function(err){
        if(err) throw new Error();

        recoverZKTree(function(){
          //init node service
          initNode('/'+CONSTANTS.SERVICE_ROOT,function(err){
            if(err){
              throw new Error('something wrong in before');
            }

            //init node testService
            initNode('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode,function(err){
              if(err){
                throw new Error('something wrong in before');
              }

              var count = 2;
              //init node version1.0
              initNode('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/1.0',function(err){
                if(err){
                  throw new Error('something wrong in before(version node)');
                }
                if(--count == 0){
                  done();
                }
              });
              //init node version2.0
              initNode('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/2.0',function(err){
                if(err){
                  throw new Error('something wrong in before(version node)');
                }
                if(--count == 0){
                  done();
                }
              });
            });
          });
        },true);

      });
    });

  });
  /*}}}*/

  /*{{{ after */
  after(function(done){
    setTimeout(function(){
      recoverZKTree(function(){
        zk.close();
        done();
      },false);
    },2000);
  });
  /*}}}*/

  describe('interface test',function(){

    describe('register and unregister test',function(){

      /*{{{ afterEach */
      afterEach(function(done){
        iShare.recover();

        var count = 0;
        var versions = ['1.0','2.0'];
        var nodeCount = versions.length;
        var nodePathArr = [];

        for(var idx in versions){
          (function(){
            var saveV = versions[idx];
            zk.a_get_children('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/'+saveV,false,function(rc,error,children){
              for(var i in children){
                nodePathArr.push('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/'+saveV+'/'+children[i]);
                count ++;
              }
              if(--nodeCount === 0){
                if(count === 0){
                  done();
                  return;
                }

                for(var i = 0;i<nodePathArr.length;i++){
                  deleteNode(nodePathArr[i],function(err){
                    if(err){
                      throw new Error('wrong in afterEach');
                    }else{
                      if(--count === 0){
                        done();
                      }
                    }
                  });
                }
              }
            });
          })();
        }

      });
      /*}}}*/

      /*{{{ test register and unregister service ok */
      it('test register and unregister service ok',function(done){
        var regId;
        var info = {
          name : serviceNode,
          version : '1.0',
          addr : 'http://127.0.0.1:9111',
          callback : function(err){
            if(err){
              throw new Error(err);
            }
            zk.a_get_children('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/1.0',false,function(rc,error,children){
              children.length.should.eql(1);

              zk.a_get('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/1.0/'+children[0],false,function(rc,error,stat,data){
                data = JSON.parse(data);
                data.addr.should.eql('http://127.0.0.1:9111');
                
                iShare.unRegisterService(regId,function(err){
                  if(err){
                    throw new Error(err);
                  }else{
                    zk.a_get_children('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/1.0',false,function(rc,error,children){
                      children.length.should.eql(0);
                      done();
                    });
                  }
                });
              });
            });
          }
        };

        regId = iShare.registerService(info.name,info.version,info.addr,info.meta,info.callback);
      });
      /*}}}*/

      /*{{{ test register two services ok*/
      it('test register two services ok',function(done){
        var regId;
        var regId2;
        var info = {
          name : serviceNode,
          version : '1.0',
          addr : 'http://127.0.0.1:9111',
          callback : function(err){
            if(err){
              throw new Error(err);
            }
            var info2 = {
              name : serviceNode,
              version : '2.0',
              addr : 'http://127.0.0.1:9112',
              callback : function(err){
                if(err){
                  throw new Error(err);
                }
                iShare.unRegisterService(regId,function(err2){
                  if(err2){
                    throw new Error(err2);
                  }
                  iShare.unRegisterService(regId2,function(err3){
                    if(err3){
                      throw new Error(err3);
                    }
                    done();
                  })
                });
              }
            };
            regId2 = iShare.registerService(info2.name,info2.version,info2.addr,info2.meta,info2.callback);
          }
        };
        regId = iShare.registerService(info.name,info.version,info.addr,info.meta,info.callback);
      });
      /*}}}*/

      /*{{{ test register with new version ok */
      it('test register with new version ok',function(done){
        var regId;
        var info = {
          name : serviceNode,
          version : '6.0',
          addr : 'http://127.0.0.1:9115',
          callback : function(err){
            if(err){
              throw new Error(err);
            }
            zk.a_get_children('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode,false,function(rc,error,children){
              children.length.should.eql(3);

              zk.a_get_children('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/6.0',false,function(rc,error,children){
                children.length.should.eql(1);

                iShare.unRegisterService(regId,function(err){
                  if(err){
                    throw new Error(err);
                  }

                  zk.a_delete_('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/6.0',0,function(rc,error){
                    if(rc != 0){
                      false.should.be.ok
                    }else{
                      done();
                    }
                  });
                });
              });
            });
          }
        };

        regId = iShare.registerService(info.name,info.version,info.addr,info.meta,info.callback);
      });
      /*}}}*/

    });

    describe('subscribe and getService test',function(){

      /*{{{ beforeEach */
      beforeEach(function(done){
         
        var count = 4;
        var seq = 0;

        function cb(err){
          if(--count === 0){
            done();
          }
        }

        var infos = [
          {
            name : serviceNode,
            version : '1.0',
            addr : 'http://127.0.0.1:9111',
            meta : {room:'CM4'},
            callback:cb
          },
          {
            name : serviceNode,
            version : '2.0',
            addr : 'http://127.0.0.1:9112',
            meta : {room:'CM3'},
            callback:cb
          },
          {
            name : serviceNode,
            version : '2.0',
            addr : 'http://127.0.0.1:9113',
            meta : {room:'CM4'},
            callback:cb
          },
          {
            name : serviceNode,
            version : '2.0',
            addr : 'http://127.0.0.1:9114',
            meta : {room:'CM4'},
            callback:cb
          },
        ]; 

        infos.forEach(function(info){
          initNode(
            '/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/'+info.version+'/'+(seq++),
            info.callback,
            JSON.stringify({addr:info.addr,meta:info.meta})
          );
        });
        
      });
      /*}}}*/

      /*{{{ afterEach */
      afterEach(function(done){
        
        var path = ['/1.0/0','/2.0/1','/2.0/2','/2.0/3'];
        var count = path.length;

        path.forEach(function(one){
          deleteNode('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+one,function(err){
            if(--count === 0){
              iShare.recover();
              setTimeout(function(){
                done();
              },2000);
            }
          });
        });
      });
      /*}}}*/

      /*{{{ test subscribe ok */
      it('test subscribe ok',function(done){
        var caseEmitter = new EventEmitter();

        //normal filter
        var serv = iShare.subscribe(serviceNode,'2.0',function(err){
          if(err){
            throw new Error(err);
          }
          serv.getServiceAll().length.should.eql(3);
          caseEmitter.emit('continue');
        });

        caseEmitter.on('continue',function(){
          var count = 7;
          //recent version
          var serv2 = iShare.subscribe(serviceNode,'0',function(err){
            if(err){
              throw new Error(err);
            }
            serv2.getServiceAll().length.should.eql(3);
            if(--count === 0){
              done();
            }
          });

          //filter is an object
          var serv3 = iShare.subscribe(serviceNode,{version:'1.0'},function(err){
            if(err){
              throw new Error(err);
            }
            serv3.getServiceAll().length.should.eql(1);
            if(--count === 0){
              done();
            }
          });

          //filter is an object and recent version
          var serv4 = iShare.subscribe(serviceNode,{version:'0'},function(err){
            if(err){
              throw new Error(err);
            }
            serv4.getServiceAll().length.should.eql(3);
            if(--count === 0){
              done();
            }
          });

          //filter is an object and set min
          var serv5 = iShare.subscribe(serviceNode,{version:{min:'2.0'}},function(err){
            if(err){
              throw new Error(err);
            }
            serv5.getServiceAll().length.should.eql(3);
            if(--count === 0){
              done();
            }
          });

          //filter is an object and set min and no such big version
          var serv6 = iShare.subscribe(serviceNode,{version:{min:'7.0'}},function(err){
            if(err){
              throw new Error(err);
            }
            serv6.getServiceAll().length.should.eql(0);
            if(--count === 0){
              done();
            }
          });

          //filter is an object and version is undefined and set room
          var serv7 = iShare.subscribe(serviceNode,{room:'CM4'},function(err){
            if(err){
              throw new Error(err);
            }
            serv7.getServiceAll().length.should.eql(2);
            if(--count === 0){
              done();
            }
          });

          //filter is wrong type
          var servr8 = iShare.subscribe(serviceNode,1,function(err){
            if(err){
              err.name.should.eql('FILTER_WRONG');
              if(--count === 0){
                done();
              }
            }
          });

        });

      });
      /*}}}*/

      /*{{{ test getServiceAny ok*/
      it('test getServiceAny ok',function(done){
        var serv = iShare.subscribe(serviceNode,'2.0',function(err){
          if(err){
            throw new Error(err);
          }
          var get1 = serv.getServiceAny();
          var get2 = serv.getServiceAny();
          get1.should.not.equal(get2);
          done();
        });
      });
      /*}}}*/

      /*{{{ test subscribe online and offline ok*/
      it('test subscribe online and offline ok',function(done){
        var regId;
        var step = 0;
        var serv = iShare.subscribe(serviceNode,'2.0',function(err){
          if(err){
            throw new Error(err);
          }
          var get = serv.getServiceAll();
          serv.on('update',function(nodes){
            if(step === 0){
              //online
              nodes.length.should.eql(get.length+1);
              iShare.unRegisterService(regId,function(err){
                if(err){
                  throw new Error(err);
                }
              });
              step++;
            }else if(step === 1){
              //offline
              nodes.length.should.eql(get.length);
              step++;
              done();
            }
          });

          var info = {
            name : serviceNode,
            version : '2.0',
            addr : 'http://127.0.0.1:9115',
            callback : function(err){
              if(err){
                throw new Error(err);
              }
            }
          };

          regId = iShare.registerService(info.name,info.version,info.addr,info.meta,info.callback);
        });
      });
      /*}}}*/

      /*{{{ test default heartbeat ok */
      it('test default heartbeat ok',function(done){
        var regId;
        var server = http.createServer(function(req,res){
          res.end('ok');
        }).listen('9222',function(){
          var step = 0;
          var info = {
            name : serviceNode,
            version : '2.0',
            addr : 'http://127.0.0.1:9222',
            callback : function(err){
              if(err){
                throw new Error(err);
              }

              var serv = iShare.subscribe(serviceNode,'2.0',function(err){
                if(err){
                  throw new Error(err);
                }
                serv.getServiceAll().length.should.eql(4);
                server.close();
              });

              serv.heartbeat('default',500);

              serv.on('update',function(nodes){
                if(step === 0){
                  nodes.length.should.eql(3);
                  step++;
                  server = http.createServer(function(req,res){
                    res.end('ok');
                  }).listen('9222');
                }else if(step === 1){
                  nodes.length.should.eql(4);
                  server.close();
                  step++;
                  done();
                }
              });

            }
          };
          regId = iShare.registerService(info.name,info.version,info.addr,info.meta,info.callback);
        });

      });
      /*}}}*/

      /*{{{ test heartbeat set ok */
      it('test heartbeat set ok',function(done){

        var server = http.createServer(function(req,res){
          res.end('ok');
        }).listen('9222',function(){
          var step = 0;
          var info = {
            name : serviceNode,
            version : '2.0',
            addr : 'http://127.0.0.1:9222',
            callback : function(err){
              if(err){
                throw new Error(err);
              }

              var serv = iShare.subscribe(serviceNode,'2.0',function(err){
                if(err){
                  throw new Error(err);
                }
                serv.getServiceAll().length.should.eql(4);
                server.close();
              });

              serv.heartbeat(function(addr,cb){
                exec('curl '+addr,function(err,stdout,stderr){
                  if(err){
                    cb('service is unavailable');
                  }else{
                    cb();
                  }
                });
              },500);

              serv.on('update',function(nodes){
                if(step === 0){
                  nodes.length.should.eql(3);
                  step++;
                  server = http.createServer(function(req,res){
                    res.end('ok');
                  }).listen('9222');
                }else if(step === 1){
                  nodes.length.should.eql(4);
                  server.close();
                  step++;
                  done();
                }
              });

            }
          };
          iShare.registerService(info.name,info.version,info.addr,info.meta,info.callback);
        });

      });
      /*}}}*/

      /*{{{ test write cache ok*/
      it('test write cache ok',function(done){
        try{
          var splits = testConf.cachepath.split('/');
          var prefix = splits.pop();
          var dir    = splits.join('/');
          var pattern = new RegExp('^'+prefix,'i');

          var get = fs.readdirSync(dir);
          for(var i = 0;i<get.length;i++){
            if(pattern.test(get[i])){
              fs.unlinkSync(dir+'/'+get[i]);
            }
          }
        }catch(e){}
        
        var serv = iShare.subscribe(serviceNode,'2.0',function(err){
          if(err){
            throw new Error(err);
          }
          serv.getServiceAll().length.should.eql(3);

          var get = JSON.parse(fs.readFileSync(testConf.cachepath+process.pid));
          var key = JSON.stringify({name:serviceNode,filter:'2.0'});
          get[key].length.should.eql(3);
          done();
        });
      });
      /*}}}*/

      /*{{{ test read cache and zk recover later ok */
      it('test read cache and zk recover later ok',function(done){
        try{
          var splits = testConf.cachepath.split('/');
          var prefix = splits.pop();
          var dir    = splits.join('/');
          var pattern = new RegExp('^'+prefix,'i');

          var get = fs.readdirSync(dir);
          for(var i = 0;i<get.length;i++){
            if(pattern.test(get[i])){
              fs.unlinkSync(dir+'/'+get[i]);
            }
          }
        }catch(e){}
        //write fake cache file
        var key = JSON.stringify({name:serviceNode,filter:'2.0'});
        var content = [{addr:'http://127.0.0.1:9115',meta:{}}];
        var cache = {};
        cache[key] = content;
        fs.writeFileSync(testConf.cachepath+'1',JSON.stringify(cache));

        content = [{addr:'http://127.0.0.1:9116',meta:{}}];
        var cache2 = {};
        cache2[key] = content;
        fs.writeFileSync(testConf.cachepath+'2',JSON.stringify(cache2));

        var splits = testConf.zookeeper.split(':');
        splits.pop();
        splits.push('2188/');
        var fake = splits.join(':');
        //set useless config
        iShare.setConfig({
          zookeeper : fake,
          username : '',
          password : '',
          cachepath : testConf.cachepath
        });

        var serv = iShare.subscribe(serviceNode,'2.0',function(err){
          if(err){
            throw new Error(err);
          }
          //get cache content
          serv.getServiceAll().length.should.eql(2);
          //listen for list update
          serv.on('update',function(nodes){
            nodes.length.should.eql(3);
            done();
          });

          //set back to normal config
          iShare.setConfig({
            zookeeper : testConf.zookeeper,
            username : '',
            password : '',
            cachepath : testConf.cachepath
          });
        });
      });
      /*}}}*/

      /*{{{ test get recent add new version ok*/
      it('test get recent add new version ok',function(done){
        var regId;
        var step = 0;
        var serv = iShare.subscribe(serviceNode,'0',function(err){
          if(err){
            throw new Error(err);
          }
          serv.getServiceAll().length.should.eql(3);

          serv.on('update',function(nodes){
            if(step === 1){return;}
            step++;
            nodes.length.should.eql(1);
            iShare.unRegisterService(regId,function(err){
              process.nextTick(function(){
                iShare.recover();
                deleteNode('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/6.0',function(err){
                  done();
                });
              });
            });
          });
          var info = {
            name : serviceNode,
            version : '6.0',
            addr : 'http://127.0.0.1:9115',
            callback : function(err){
              if(err){
                throw new Error(err);
              }
            }
          };
          regId = iShare.registerService(info.name,info.version,info.addr,info.meta,info.callback);
        });
      });
      /*}}}*/

    });

  });

});

/*{{{ createServers()*/
function createServers(ports,cb){
  var count = ports.length;
  for(var i = 0;i < ports.length; i++){
    http.createServer(function(req,res){
      res.end('ok');
    }).listen(ports[i],function(){
      if(--count === 0){
        cb();
      }
    });
  }
}
/*}}}*/

/*{{{ initNode()*/
function initNode(path,cb,info){
  var content = '';
  if(info !== undefined){
    content = info;
  }
  zk.a_create(path,content,0,function(rc,error,path){
    if(rc != 0){
      cb('wrong in initNode');
    }else{
      cb();
    }
  });
}
/*}}}*/

/*{{{ recoverZKTree()*/
function recoverZKTree(cb,ignore){
  //delete version node
  deleteNode('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/1.0',function(err){
    if(err && !ignore){
      throw new Error('something wrong in after');
    }
    deleteNode('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode+'/2.0',function(err){
      if(err && !ignore){
        throw new Error('something wrong in after');
      }else{
        //delete certain service node
        deleteNode('/'+CONSTANTS.SERVICE_ROOT+'/'+serviceNode,function(err){
          if(err && !ignore){
            throw new Error('something wrong in after');
          }
          //delete service node
          deleteNode('/'+CONSTANTS.SERVICE_ROOT,function(err){
            if(err && !ignore){
              throw new Error('something wrong in after');
            }
            cb();
          });
        });
      }
    });
  });
}
/*}}}*/

/*{{{ deleteNode()*/
function deleteNode(path,cb){
  zk.a_delete_(path,0,function(rc,error){
    if(rc != 0){
      cb('wrong in deleteNode');
    }else{
      cb();
    }
  });
}
/*}}}*/

