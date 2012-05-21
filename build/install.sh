# !/bin/bash

path=`pwd`

if [ ! -d "$path/node_modules" ]; then
  mkdir node_modules && cd node_modules
  wget --no-check-certificate https://github.com/vincent-zhao/node-zookeeper/zipball/master
  unzip master && rm master && mv vincent* zookeeper && cd zookeeper
  node-waf configure build
  npm install
  cd $path && npm install
fi
