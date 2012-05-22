test:
	@sh build/install.sh
	@./node_modules/mocha/bin/mocha --reporter tap --ignore-leaks -t 20000 test/test.*.js

clean:
	@rm test/tmp/.cache

cov: 
	@sh build/install.sh
	@mv lib lib_for_cov_bak
	-jscoverage lib_for_cov_bak lib
	-./node_modules/mocha/bin/mocha --reporter html-cov --ignore-leaks -t 20000 test/test.*.js > coverage.html
	@rm -fr lib && mv lib_for_cov_bak lib 

.PHONY: test
