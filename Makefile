test: 
	@./node_modules/mocha/bin/mocha --reporter tap --ignore-leaks -t 20000 test/test.*.js

clean:
	@rm -rf test/tmp/.cache*

cov: rebuild
	@mv lib lib_for_cov_bak
	-jscoverage lib_for_cov_bak lib
	-./node_modules/mocha/bin/mocha --reporter html-cov --ignore-leaks -t 20000 test/test.*.js > coverage.html
	@rm -fr lib && mv lib_for_cov_bak lib 

install:
	-mkdir test/tmp
	@mv node_modules/light-node-zookeeper node_modules/zookeeper

rebuild:
	@npm install

.PHONY: test
