var should    = require('should');
var http      = require('http');
var Zookeeper = require('zookeeper');
var fs        = require('fs');
var Client    = require(__dirname + '/../lib/client');
var testConf  = require(__dirname + '/etc/test_config');
var EventEmitter = require('events').EventEmitter;

Client.init({
  addr : testConf.addr,
  user : testConf.user,
  pwd  : testConf.pwd,
  localPath : testConf.localPath,
  root : '/'+testConf.servicePath.split('/')[1]
});

var zk;
var tmpArr;

describe('client test',function(){

  /*{{{ before */
  before(function(done){
    
    var ports = [9111,9112,9113,9114,9115];
    createServers(ports,function(){
      zk = new Zookeeper({
        connect : testConf.addr,
        timeout : 10000
      });
      
      zk.connect(function(err){
        if(err) throw new Error();

        recoverZKTree(function(){
          var get = testConf.servicePath.split('/');
          get.shift();
          //init node service
          initNode('/' + get[0],function(err){
            if(err){
              throw new Error('something wrong in before');
            }

            //init node testService
            initNode(testConf.servicePath,function(err){
              if(err){
                throw new Error('something wrong in before');
              }

              var count = 2;
              //init node version1.0
              initNode(testConf.servicePath + '/version1.0',function(err){
                if(err){
                  throw new Error('something wrong in before(version node)');
                }
                if(--count == 0){
                  done();
                }
              });
              //init node version2.0
              initNode(testConf.servicePath + '/version2.0',function(err){
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
    },1000);
  });
  /*}}}*/

  describe('interface test',function(){

    describe('register and unregister test',function(){
    
      /*{{{ afterEach */
      afterEach(function(done){
        Client.cleanCache();
        Client.zkClose();

        var count = 0;
        var versions = ['version1.0','version2.0'];
        var nodeCount = versions.length;
        var nodePathArr = [];

        for(var idx in versions){
          (function(){
            var saveV = versions[idx];
            zk.a_get_children(testConf.servicePath + '/' + saveV,false,function(rc,error,children){
              for(var i in children){
                nodePathArr.push(testConf.servicePath+'/'+saveV+'/'+children[i]);
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
        var infos = [{
          serviceName : testConf.servicePath.split('/')[2],
          version : '1.0',
          ctlInfo:{tm:1000},
          nodeInfo : {
            method : 'GET',
            url    : 'http://127.0.0.1:9111/',
            room   : 'CM4'
          },
          cb : function(err,obj){
            if(err){
              throw new Error(err);
            }else{
              zk.a_get(obj.getInfo()._PATH_, false, function(rc,error,stat,data){
                if(rc != 0){
                  throw new Error();
                }else{
                  //register ok
                  JSON.parse(data.toString()).should.eql(infos[0].nodeInfo);

                  obj.unRegisterService(function(err){
                    if(err) throw new Error(err);

                    zk.a_exists(obj.getInfo()._PATH_,false,function(rc,error,stat){
                      //unregister ok
                      error.should.eql('no node');
                      done();
                    });
                  });
                }
              });
            }
          }
        }];

        registerServices(infos);
      });
      /*}}}*/

      /*{{{ test register with wrong info ok */
      it('test register with wrong info ok',function(done){
        var infos = [{
          serviceName : testConf.servicePath.split('/')[2],
          version : '1.0',
          ctlInfo : {tm:1000},
          nodeInfo : {
            method : 'GET',
            room   : 'CM4'
          },
          cb : function(err,obj){
            if(err === 'node info is wrong!'){
              done();
            }
          }
        }];

        registerServices(infos);
      });
      /*}}}*/
     
      /*{{{ test register with new version ok */
      it('test register with new version ok',function(done){
        var info = {
          serviceName : testConf.servicePath.split('/')[2],
          version : '6.0',
          ctlInfo : {tm:1000},
          nodeInfo : {
            method : 'GET',
            url    : 'http://127.0.0.1:9115/',
            room   : 'CM4'
          },
          cb : function(err,obj){
            zk.a_get_children(testConf.servicePath+'/version6.0',false,function(rc,error,children){
              children.length.should.eql(1);

              obj.unRegisterService(function(err){

                zk.a_get_children(testConf.servicePath+'/version6.0',false,function(rc,error,children){
                  children.length.should.eql(0);

                  zk.a_delete_(testConf.servicePath+'/version6.0',0,function(rc,error){
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
        }
        registerServices([info]);
      });
      /*}}}*/

      /*{{{ test not given zk addr ok */
      it('test not given zk addr',function(done){
        Client.init({
          user : testConf.user,
          pwd  : testConf.pwd,
          localPath : testConf.localPath,
          root : '/'+testConf.servicePath.split('/')[1]
        });

        var infos = [{
          serviceName : testConf.servicePath.split('/')[2],
          version : '1.0',
          ctlInfo : {tm:1000},
          nodeInfo : {
            url : 'http://127.0.0.1:7115',
            method : 'GET',
            room   : 'CM4'
          },
          cb : function(err,obj){
            err.should.eql('call init function first!');

            Client.init({
              addr : testConf.addr,
              user : testConf.user,
              pwd  : testConf.pwd,
              localPath : testConf.localPath,
              root : '/'+testConf.servicePath.split('/')[1]
            });

            done();
          }
        }];

        registerServices(infos);
      });
      /*}}}*/

    });

    describe('getService test',function(){

      /*{{{ beforeEach */
      beforeEach(function(done){
         
        var count = 4;
        tmpArr = [];

        function callback(err,obj){
          tmpArr.push(obj);
          if(--count === 0){
            done();
          }
        }

        var infos = [
          {
            serviceName : testConf.servicePath.split('/')[2],
            version : '1.0',
            ctlInfo : {tm:1000},
            nodeInfo : {
              method : 'GET',
              url    : 'http://127.0.0.1:9111/',
              room   : 'CM4'
            },
            cb:callback
          },
          {
            serviceName : testConf.servicePath.split('/')[2],
            version : '2.0',
            ctlInfo : {tm:1000},
            nodeInfo : {
              method : 'GET',
              url    : 'http://127.0.0.1:9112/',
              room   : 'CM3'
            },
            cb:callback
          },
          {
            serviceName : testConf.servicePath.split('/')[2],
            version : '2.0',
            ctlInfo : {tm:1000},
            nodeInfo : {
              method : 'GET',
              url    : 'http://127.0.0.1:9113/',
              room   : 'CM4'
            },
            cb:callback
          },
          {
            serviceName : testConf.servicePath.split('/')[2],
            version : '2.0',
            ctlInfo : {tm:1000},
            nodeInfo : {
              method : 'GET',
              url    : 'http://127.0.0.1:9114/',
              room   : 'CM4'
            },
            cb:callback
          },
        ]; 

        registerServices(infos);
        
      });
      /*}}}*/

      /*{{{ afterEach */
      afterEach(function(done){
        Client.cleanCache();
        Client.zkClose();
        setTimeout(function(){
          done();
        },4000);
      });
      /*}}}*/

      /*{{{ test getServiceAny ok */
      it('test getServiceAny ok',function(done){
        var caseCount = 4;

        Client.getServiceAny(testConf.servicePath.split('/')[2], "2.0", {tm:10000}, function(err,nodeInfo){
          var url = nodeInfo.url;
          if(url === 'http://127.0.0.1:9112/' || url === 'http://127.0.0.1:9113/' || url === 'http://127.0.0.1:9114/'){
            true.should.be.ok;
          }else{
            false.should.be.ok;
          }
          if(--caseCount === 0){
            done();
          }
        },false);

        Client.getServiceAny(
          testConf.servicePath.split('/')[2], 
          {
            version : {min:"2.0"},
            room    : 'CM4'
          }, {tm:10000},
          function(err,nodeInfo){
            var url = nodeInfo.url;
            if(url === 'http://127.0.0.1:9113/' || url === 'http://127.0.0.1:9114/'){
              true.should.be.ok;
            }else{
              false.should.be.ok;
            }
            if(--caseCount === 0){
              done();
            }
          },false);
          
        Client.getServiceAny(testConf.servicePath.split('/')[2], "0",{tm:10000}, function(err,nodeInfo){
          var url = nodeInfo.url;
          if(url === 'http://127.0.0.1:9112/' || url === 'http://127.0.0.1:9113/' || url === 'http://127.0.0.1:9114/'){
            true.should.be.ok;
          }else{
            false.should.be.ok;
          }
          if(--caseCount === 0){
            done();
          }
        },false);

        Client.getServiceAny(
          testConf.servicePath.split('/')[2], 
          {
            version : {min:"3.0"},
            room    : 'CM4'
          }, {tm:10000},
          function(err,nodeInfo){
            err.should.eql('no such services');
            if(--caseCount === 0){
              done();
            }
          },false);

      });
      /*}}}*/

      /*{{{ test getServiceAll ok */
      it('test getServiceAll ok',function(done){
        var caseCount = 5;

        Client.getServiceAll(testConf.servicePath.split('/')[2]+'/',"2.0",{tm:10000},function(err,nodeInfos){
          nodeInfos.length.should.eql(3);
          nodeInfos[0].method.should.eql('GET');
          if(--caseCount === 0){
            done();
          }
        },false);

        Client.getServiceAll(testConf.servicePath.split('/')[2],
          {
            version : {min : "2.0"},
            room    : 'CM4'
          },{tm:10000},
          function(err,nodeInfos){
            nodeInfos.length.should.eql(2);
            nodeInfos[0].method.should.eql('GET');
            if(--caseCount === 0){
              done();
            }
        },false);

        Client.getServiceAll(testConf.servicePath.split('/')[2],
          {
            version : {min : "5.0"},
            room    : 'CM4'
          },{tm:10000},
          function(err,nodeInfos){
            err.should.eql('no such services');
            if(--caseCount === 0){
              done();
            }
        },false);

        Client.getServiceAll(testConf.servicePath.split('/')[2],
          {
            room    : 'CM4'
          },{tm:10000},
          function(err,nodeInfos){
            err.should.eql('please tell which version');
            if(--caseCount === 0){
              done();
            }
        },false);

        Client.getServiceAll(testConf.servicePath.split('/')[2],1,{tm:10000},
          function(err,nodeInfos){
            err.should.eql('unsupport filter type');
            if(--caseCount === 0){
              done();
            }
        },false);

      });
      /*}}}*/

      /*{{{ test twice test use local cache ok */
      it('test twice test use local cache ok',function(done){
        Client.init({
          addr : testConf.addr,
          user : testConf.user,
          pwd  : testConf.pwd,
          localPath : testConf.localPath,
          root : '/'+testConf.servicePath.split('/')[1],
          checkInterval : 100000
        });

        Client.getServiceAll(testConf.servicePath.split('/')[2],"2.0",{tm:10000},function(err,nodeInfos){
          nodeInfos.length.should.eql(3);
          nodeInfos[0].method.should.eql('GET');

          setTimeout(function(){
            Client.getServiceAll(testConf.servicePath.split('/')[2],"2.0",{tm:10000},function(err,nodeInfos){
              nodeInfos.length.should.eql(3);
              nodeInfos[0].method.should.eql('GET');

              Client.init({
                addr : testConf.addr,
                user : testConf.user,
                pwd  : testConf.pwd,
                localPath : testConf.localPath,
                root : '/'+testConf.servicePath.split('/')[1],
                checkInterval : 500
              });

              done();
            },false);
          },2000);
        },false);
      });
      /*}}}*/

      /*{{{ test getServiceAny offline ok */
      it('test getServiceAny offline ok',function(done){
        var c = 2;
        Client.getServiceAny(testConf.servicePath.split('/')[2], "2.0",{tm:10000}
          ,function(err,nodeInfo){
            var url = nodeInfo.url;
            for(var i in tmpArr){
              if(tmpArr[i].getInfo().url == url){
                (function(){
                  var tmpI = i;
                  tmpArr[tmpI].unRegisterService(function(err){
                    delete tmpArr[tmpI];
                    if(--c === 0){
                      done();
                    }
                  });
                })();
                break;
              }
            }
          },function(state,nodeInfo2){
            if(--c === 0){
              done();
            }
          }
        );

      });
      /*}}}*/

      /*{{{ test getServiceAll online ok */
      it('test getServiceAll online ok',function(done){
        var firstNodes;
        var tested = false;

        Client.getServiceAll(testConf.servicePath.split('/')[2],
          {
            version : {min : '2.0'},
            room    : 'CM4'
          },{tm:10000},
          function(err,nodeInfos){
            if(err){
              false.should.be.ok;
              return;
            }
            firstNodes = nodeInfos;
            var info = {
              serviceName : testConf.servicePath.split('/')[2],
              version : '2.0',
              ctlInfo : {tm:1000},
              nodeInfo : {
                method : 'GET',
                url    : 'http://127.0.0.1:9115/',
                room   : 'CM4'
              },
              cb:function(err,obj){
                tmpArr.push(obj);
              }
            }
            registerServices([info]);
          },
          function(err,nodeInfos2){
            if(tested){return;}
            if(err){
              return;
            }
            (nodeInfos2.length-1).should.eql(firstNodes.length);
            tested = true;
            done();
          });

      });
      /*}}}*/

      /*{{{ test getServiceAll offline ok */
      it('test getServiceAll offline ok',function(done){

        var firstNodes;
        var step = 0;
        var trigger = new EventEmitter();
        var test = false;

        Client.getServiceAll(testConf.servicePath.split('/')[2],
          {
            version : {min : '2.0'},
            room    : 'CM4'
          },{tm:10000},
          function(err,nodeInfos){
            firstNodes = nodeInfos;
            var info = {
              serviceName : testConf.servicePath.split('/')[2],
              version : '2.0',
              ctlInfo : {tm:1000},
              nodeInfo : {
                method : 'GET',
                url    : 'http://127.0.0.1:9115/',
                room   : 'CM4'
              },
              cb:function(err,obj){
                trigger.on('go',function(){
                  obj.unRegisterService(function(err){});
                });
              }
            }
            registerServices([info]);
          },
          function(err,nodeInfos2){
            if(step === 0){
              step++;
              trigger.emit('go');
              return;
            }
            if(test){return;}
            if(err){return;}
            if(step > 0){
              nodeInfos2.length.should.eql(firstNodes.length);
              test = true;
              done();
            }
          });

      });
      /*}}}*/

      /*{{{ test no use service online ok*/
      it('test no use service online ok',function(done){
        var info = {
          serviceName : testConf.servicePath.split('/')[2],
          version : '2.0',
          ctlInfo : {tm:1000},
          nodeInfo : {
            method : 'GET',
            url    : 'http://127.0.0.1:9211/',
            room   : 'CM4'
          },
          cb:function(err,obj){
            Client.getServiceAll(testConf.servicePath.split('/')[2],
              {
                version : {min : "2.0"},
                room    : 'CM4'
              },{tm:10000}
              ,function(err,nodeInfos){
                zk.a_get_children(testConf.servicePath+'/version2.0',false,function(rc,error,children){
                  if(rc != 0){
                    false.should.be.ok;
                    done();
                  }else{
                    children.length.should.eql(4);
                  }
                });
              }
              ,function(err,nodeInfos){
                nodeInfos.length.should.eql(2);
                done();
              }
            );
          }
        }
        registerServices([info]);
      });
      /*}}}*/

      /*{{{ test several watch callback ok when event happens */
      it('test several watch callback ok when event happens',function(done){
        var watchers = 2;
        var cases = 2;

        for(var i = 0;i < 2;i++){
          Client.getServiceAll(testConf.servicePath.split('/')[2],"2.0",{tm:10000},function(err,nodeInfos){
            if(--watchers === 0){
              var info = {
                serviceName : testConf.servicePath.split('/')[2],
                version : '2.0',
                ctlInfo : {tm:1000},
                nodeInfo : {
                  method : 'GET',
                  url    : 'http://127.0.0.1:9115/',
                  room   : 'CM4'
                },
                cb:function(err,obj){}
              }
              registerServices([info]);
            }
          },function(err,nodeInfos){
            if(--cases === 0){
              done();
            }
          });
        }

      });
      /*}}}*/

      /*{{{ test localize and loadFile ok */
      it('test localize and loadFile ok',function(done){
        Client.getServiceAll(testConf.servicePath.split('/')[2],"2.0",{tm:10000},function(err,nodeInfos){
          var get = JSON.parse(fs.readFileSync(testConf.localPath).toString());
          get[JSON.stringify({service:testConf.servicePath,filter:"2.0"})].infos.length.should.eql(3);

          Client.zkClose();
          Client.cleanCache();

          Client.init({
            addr : '127.0.0.1:8765',
            user : testConf.user,
            pwd  : testConf.pwd,
            localPath : testConf.localPath,
            root : '/'+testConf.servicePath.split('/')[1]
          });

          setTimeout(function(){
            Client.getServiceAll(testConf.servicePath.split('/')[2],"2.0",{tm:10000},function(err,nodeInfos){
              nodeInfos.length.should.eql(3);

              Client.init({
                addr : testConf.addr,
                user : testConf.user,
                pwd  : testConf.pwd,
                localPath : testConf.localPath,
                root : '/'+testConf.servicePath.split('/')[1]
              });

              done();

            },false);
          },2000);

        },false);
      });
      /*}}}*/

      /*{{{ test getServiceAll first and register later ok */
      it('test getServiceAll first and register later ok',function(done){
        Client.getServiceAll(testConf.servicePath.split('/')[2],
          {
            version : {min : "2.0"},
            room    : 'CM6'
          },{tm:10000}
          ,function(err,nodeInfos){
            nodeInfos.length.should.eql(0);

            var info = {
              serviceName : testConf.servicePath.split('/')[2],
              version : '2.0',
              ctlInfo : {tm:1000},
              nodeInfo : {
                method : 'GET',
                url    : 'http://127.0.0.1:9115/',
                room   : 'CM6'
              },
              cb : function(err,obj){}
            }

            registerServices([info]);
          }
          ,function(err,nodeInfos){
            nodeInfos.length.should.eql(1);
            done();
          }
        );
      });
      /*}}}*/

      /*{{{ test getServiceAll for recent and a new version online ok */
      it('test getServiceAll for recent and a new version online ok',function(done){
        var trigger = new EventEmitter();
        var step = 0;

        Client.getServiceAll(testConf.servicePath.split('/')[2], "0", {tm:10000}, function(err,nodeInfos){
          nodeInfos.length.should.eql(3);

          var info = {
            serviceName : testConf.servicePath.split('/')[2],
            version : '4.0',
            ctlInfo : {tm:1000},
            nodeInfo : {
              method : 'GET',
              url    : 'http://127.0.0.1:9115/',
              room   : 'CM4'
            },
            cb:function(err,obj){
              trigger.on('ok',function(){
                
                //add node to old version
                var oldNode = {
                  serviceName : testConf.servicePath.split('/')[2],
                  version : '2.0',
                  ctlInfo : {tm:1000},
                  nodeInfo : {
                    method : 'GET',
                    url    : 'http://127.0.0.1:9115/',
                    room   : 'CM4'
                  },
                  cb : function(err,obj2){
                    obj.unRegisterService(function(err){
                      zk.a_delete_(testConf.servicePath + '/version4.0',0,function(rc,error){
                        done();
                      });
                    });
                  }
                }
                registerServices([oldNode]);

              });
            }
          }
          registerServices([info]);

        },function(err,nodeInfos){
          if(step > 0){
            return;
          }else if(step >= 3){
            throw new Error('old callback');
          }else{
            step++;
          }
          nodeInfos.length.should.eql(1);
          nodeInfos[0].url.should.eql('http://127.0.0.1:9115/');
          trigger.emit('ok');

        });
      });
      /*}}}*/

      /*{{{ test getServiceAll for range and a new version online ok(filter is an obj)*/
      it('test getServiceAll for range and a new version online ok(filter is an obj)',function(done){
        var trigger = new EventEmitter();
        var step = 0;

        Client.getServiceAll(testConf.servicePath.split('/')[2], 
          {
            version:{min:'2.0'}
          },{tm:10000}
          , function(err,nodeInfos){
          nodeInfos.length.should.eql(3);

          var info = {
            serviceName : testConf.servicePath.split('/')[2],
            version : '4.0',
            ctlInfo : {tm:1000},
            nodeInfo : {
              method : 'GET',
              url    : 'http://127.0.0.1:9115/',
              room   : 'CM4'
            },
            cb:function(err,obj){
              trigger.on('ok',function(){
                obj.unRegisterService(function(err){
                  zk.a_delete_(testConf.servicePath + '/version4.0',0,function(rc,error){
                    done();
                  });
                });
              });
            }
          }
          registerServices([info]);

        },function(err,nodeInfos){
          if(step > 0){
            return;
          }else if(step >= 3){
            throw new Error('old callback');
          }else{
            step++;
          }
          nodeInfos.length.should.eql(4);
          trigger.emit('ok');

        });
      });
      /*}}}*/

      /*{{{ test available server changed in a heartbeat round ok */
      it('test available server changed in a heartbeat round',function(done){
        var step = 0;

        Client.init({
          addr : testConf.addr,
          user : testConf.user,
          pwd  : testConf.pwd,
          localPath : testConf.localPath,
          root : '/'+testConf.servicePath.split('/')[1],
          checkInterval : 1000
        });

        var server1 = http.createServer(function(req,res){
          res.end('ok');
        }).listen(6666,function(){

          var count = 2;
          var infos = [
            {
              serviceName : testConf.servicePath.split('/')[2],
              version : '2.0',
              ctlInfo:{tm:1000},
              nodeInfo : {
                method : 'GET',
                url    : 'http://127.0.0.1:6666/',
                room   : 'CM4'
              },
              cb:callback
            },
            {
              serviceName : testConf.servicePath.split('/')[2],
              version : '2.0',
              ctlInfo:{tm:1000},
              nodeInfo : {
                method : 'GET',
                url    : 'http://127.0.0.1:7777/',
                room   : 'CM3'
              },
              cb:callback
            }
          ]
          registerServices(infos);
          
          function callback(){
            if(--count === 0){
              Client.getServiceAll(testConf.servicePath.split('/')[2], "2.0", {tm:10000},function(err,nodeInfos){
              },function(err,nodeInfos){
                if(step === 0){
                  step++;
                  return;
                }
                nodeInfos.length.should.eql(4);

                Client.init({
                  addr : testConf.addr,
                  user : testConf.user,
                  pwd  : testConf.pwd,
                  localPath : testConf.localPath,
                  root : '/'+testConf.servicePath.split('/')[1]
                });

                done();
              });
            }
          }

          setTimeout(function(){
            server1.close();
          },5000);

        });

        server1.on('close',function(){
          http.createServer(function(req,res){
            res.end('ok');
          }).listen(7777);
        });

      });
      /*}}}*/

      /*{{{ test getServiceAll with self hb function */
      it('test getServiceAll with self hb function',function(done){
        var passed = false;
        Client.getServiceAll(testConf.servicePath.split('/')[2],"2.0",
          {
            tm : 10000,
            hbFunc : function(addr,cb){
              passed = true;
              cb('');
            }
          }
          ,function(err,nodeInfos){
            nodeInfos.length.should.eql(3);
            nodeInfos[0].method.should.eql('GET');
            setTimeout(function(){
              if(passed){
                done();
              }
            },3000);
          }
          ,function(err,nodeInfos){
            false.should.be.ok;
          }
        );
      });
      /*}}}*/

      /*{{{ test getServiceAll with self useless hb function */
      it('test getServiceAll with self useless hb function',function(done){
        var passed = false;
        Client.getServiceAll(testConf.servicePath.split('/')[2],"2.0",
          {
            tm : 10000,
            hbFunc : function(addr,cb){
              passed = true;
              cb('error');
            }
          }
          ,function(err,nodeInfos){
            nodeInfos.length.should.eql(3);
            nodeInfos[0].method.should.eql('GET');
          }
          ,function(err,nodeInfos){
            nodeInfos.length.should.eql(0);
            done();
          }
        );
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

/*{{{ registerServices() */
function registerServices(infos){
  for(var i in infos){
    var ele = infos[i];
    Client.registerService(ele.serviceName,ele.version,ele.ctlInfo,ele.nodeInfo,ele.cb);
  }
}
/*}}}*/

/*{{{ initNode()*/
function initNode(path,cb){
  zk.a_create(path,'',0,function(rc,error,path){
    if(rc != 0){
      cb('wrong in initNode');
    }else{
      cb();
    }
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

/*{{{ recoverZKTree()*/
function recoverZKTree(cb,ignore){
  var get = testConf.servicePath.split('/');
  get.shift();
  //delete version node
  deleteNode(testConf.servicePath + '/version1.0',function(err){
    if(err && !ignore){
      throw new Error('something wrong in after');
    }
    deleteNode(testConf.servicePath + '/version2.0',function(err){
      if(err && !ignore){
        throw new Error('something wrong in after');
      }else{
        //delete certain service node
        deleteNode(testConf.servicePath,function(err){
          if(err && !ignore){
            throw new Error('something wrong in after');
          }
          //delete service node
          deleteNode('/'+get[0],function(err){
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

