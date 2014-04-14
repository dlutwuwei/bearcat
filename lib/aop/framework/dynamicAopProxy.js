/**
 * .______    _______     ___      .______       ______     ___   .__________.
 * (   _  )  (   ____)   /   \     (   _  )     (      )   /   \  (          )
 * |  |_)  ) |  |__     /  ^  \    |  |_)  )   |  ,----'  /  ^  \ `---|  |---`
 * |   _  <  |   __)   /  /_\  \   |      )    |  |      /  /_\  \    |  |
 * |  |_)  ) |  |____ /  _____  \  |  |)  ----.|  `----./  _____  \   |  |
 * (______)  (_______/__/     \__\ ( _| `.____) (______)__/     \__\  |__|
 *
 * Bearcat DynamicAopProxy
 * Copyright(c) 2014 fantasyni <fantasyni@163.com>
 * MIT Licensed
 */

var logger = require('pomelo-logger').getLogger('bearcat', 'DynamicAopProxy');
var Constant = require('../../util/constant');
var Utils = require('../../util/utils');

/**
 * DynamicAopProxy constructor function.
 *
 * @param  {Object} advisedSupport object
 * @api public
 */
var DynamicAopProxy = function(advised) {
	this.advised = advised;
	this.init();
}

module.exports = DynamicAopProxy;

/**
 * DynamicAopProxy init function.
 * it will add proxy interfaces to DynamicAopProxy prototype, and proxy to invoke function
 *
 * @api public
 */
DynamicAopProxy.prototype.init = function() {
	if (!this.advised) {
		logger.error('DynamicAopProxy init error no advised');
		return;
	}

	var interfaces = this.advised.getInterfaces();
	var self = this;
	for (var i = 0; i < interfaces.length; i++) {
		(function(interface) {
			DynamicAopProxy.prototype[interface] = function() {
				arguments = Array.prototype.slice.apply(arguments);
				return self.invoke(interface, arguments);
			}
		})(interfaces[i]);
	}
}

/**
 * DynamicAopProxy proxy invoke function.
 * all target proxy function invoke will all this function
 *
 * @param  {String} proxy method name
 * @param  {Array}  proxy method invoke arguments
 *
 * @api private
 */
DynamicAopProxy.prototype.invoke = function(method, args) {
	var self = this;
	var invokeCb = args.pop();
	if (!Utils.checkFunction(invokeCb)) {
		// aop target args last must be next function
		if (invokeCb) {
			args.push(invokeCb);
		}
		invokeCb = function() {};
	}

	var targetSource = this.advised.getTargetSource();
	var beanName = targetSource.getBeanName();
	var target = targetSource.getTarget();

	var adviseType = Constant.AOP_ADVICE_BEFORE;
	var beforeAdvisors = this.advised.getInterceptionAdvice(method, beanName, adviseType);

	adviseType = Constant.AOP_ADVICE_AROUND;
	var aroundAdvisors = this.advised.getInterceptionAdvice(method, beanName, adviseType);

	var needAround = false;
	if (Array.isArray(aroundAdvisors) && aroundAdvisors.length) {
		needAround = true;
	}

	adviseType = Constant.AOP_ADVICE_AFTER;
	var afterAdvisors = this.advised.getInterceptionAdvice(method, beanName, adviseType);

	var needAfter = false;
	if (Array.isArray(afterAdvisors) && afterAdvisors.length) {
		needAfter = true;
	}

	this.doInvokeAdvisorsBefore(method, args, beforeAdvisors, function() {
		if (needAround) {
			self.doInvokeAdvisorsAround(target, method, args, aroundAdvisors, function() {
				arguments = Array.prototype.slice.apply(arguments);
				invokeCb.apply(null, arguments);
				if (needAfter) {
					self.doInvokeAdvisorsAfter(method, arguments, afterAdvisors, function() {});
				}
			});
		} else {
			var next = function() {
				arguments = Array.prototype.slice.apply(arguments);
				invokeCb.apply(null, arguments);
				if (needAfter) {
					self.doInvokeAdvisorsAfter(method, arguments, afterAdvisors, function() {});
				}
			}

			args.push(next);
			target[method].apply(target, args);
		}
	});
}

/**
 * DynamicAopProxy do invoke before advisors chain.
 *
 * @param  {String} proxy method name
 * @param  {Array}  proxy method invoke arguments
 * @param  {Object} target advisors
 * @param  {Function} callback function
 *
 * @api private
 */
DynamicAopProxy.prototype.doInvokeAdvisorsBefore = function(method, args, advisors, cb) {
	var index = 0;

	if (!advisors || !Array.isArray(advisors)) {
		cb();
	}

	var next = function(err) {
		if (err || index >= advisors.length) {
			cb(err);
			return;
		}

		var advisor = advisors[index++];
		var advise = advisor.getAdvice();
		var aspectBean = advisor.getBean();
		var pointcut = advisor.getPointcut();

		var _next = function(err) {
			next(err);
		};

		if (advisor.isRuntime()) {
			args.push(_next);
			aspectBean[advise].apply(aspectBean, args);
		} else {
			aspectBean[advise](_next);
		}
	}

	next();
}

/**
 * DynamicAopProxy do invoke around advisors chain.
 *
 * @param  {Object} target object
 * @param  {String} proxy method name
 * @param  {Array}  proxy method invoke arguments
 * @param  {Object} target advisors
 * @param  {Function} callback function
 *
 * @api private
 */
DynamicAopProxy.prototype.doInvokeAdvisorsAround = function(target, method, args, advisors, cb) {
	var advisor = advisors[0];
	var pointcut = advisor.getPointcut();
	var advise = advisor.getAdvice();
	var aspectBean = advisor.getBean();

	if (advisor.isRuntime()) {
		args.unshift(method);
		args.unshift(target);
		args.push(cb);
		aspectBean[advise].apply(aspectBean, args);
	} else {
		aspectBean[advise](target, method, cb);
	}
}

/**
 * DynamicAopProxy do invoke after advisors chain.
 *
 * @param  {String} proxy method name
 * @param  {Array}  proxy method invoke arguments
 * @param  {Object} target advisors
 * @param  {Function} callback function
 *
 * @api private
 */
DynamicAopProxy.prototype.doInvokeAdvisorsAfter = function(method, args, advisors, cb) {
	var index = 0;

	if (!advisors || !Array.isArray(advisors)) {
		cb();
	}

	var next = function(err) {
		if (err || index >= advisors.length) {
			cb(err);
			return;
		}
		var advisor = advisors[index++];
		var advise = advisor.getAdvice();
		var aspectBean = advisor.getBean();
		var pointcut = advisor.getPointcut();

		var _next = function(err) {
			next(err);
		};

		args.push(_next);
		aspectBean[advise].apply(aspectBean, args);
	}

	next();
}