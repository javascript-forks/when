/** @license MIT License (c) copyright 2013 original author or authors */

/**
 * Collection of helpers for interfacing with node-style asynchronous functions
 * using promises.
 *
 * @author Brian Cavalier
 * @contributor Renato Zannon
 */

(function(define) {
define(function(require) {

	var when, slice, setTimer, _liftAll;

	when = require('./when');
	_liftAll = require('./lib/liftAll');
	setTimer = require('./lib/timer').set;
	slice = Array.prototype.slice;

	return {
		lift: lift,
		liftAll: liftAll,
		apply: apply,
		call: call,
		createCallback: createCallback,
		bindCallback: bindCallback,
		liftCallback: liftCallback
	};

	/**
	 * Takes a node-style async function and calls it immediately (with an optional
	 * array of arguments or promises for arguments). It returns a promise whose
	 * resolution depends on whether the async functions calls its callback with the
	 * conventional error argument or not.
	 *
	 * With this it becomes possible to leverage existing APIs while still reaping
	 * the benefits of promises.
	 *
	 * @example
	 *    function onlySmallNumbers(n, callback) {
	 *		if(n < 10) {
	 *			callback(null, n + 10);
	 *		} else {
	 *			callback(new Error("Calculation failed"));
	 *		}
	 *	}
	 *
	 *    var nodefn = require("when/node/function");
	 *
	 *    // Logs '15'
	 *    nodefn.apply(onlySmallNumbers, [5]).then(console.log, console.error);
	 *
	 *    // Logs 'Calculation failed'
	 *    nodefn.apply(onlySmallNumbers, [15]).then(console.log, console.error);
	 *
	 * @param {function} func node-style function that will be called
	 * @param {Array} [args] array of arguments to func
	 * @returns {Promise} promise for the value func passes to its callback
	 */
	function apply(func, args) {
		return _apply(func, this, args);
	}

	/**
	 * Apply helper that allows specifying thisArg
	 * @private
	 */
	function _apply(func, thisArg, args) {
		return when.all(args || []).then(function(resolvedArgs) {
			return when.promise(function(resolve, reject) {
				var nodeback = _createCallback(resolve, reject);
				func.apply(thisArg, resolvedArgs.concat(nodeback));
			});
		});
	}

	/**
	 * Has the same behavior that {@link apply} has, with the difference that the
	 * arguments to the function are provided individually, while {@link apply} accepts
	 * a single array.
	 *
	 * @example
	 *    function sumSmallNumbers(x, y, callback) {
	 *		var result = x + y;
	 *		if(result < 10) {
	 *			callback(null, result);
	 *		} else {
	 *			callback(new Error("Calculation failed"));
	 *		}
	 *	}
	 *
	 *    // Logs '5'
	 *    nodefn.call(sumSmallNumbers, 2, 3).then(console.log, console.error);
	 *
	 *    // Logs 'Calculation failed'
	 *    nodefn.call(sumSmallNumbers, 5, 10).then(console.log, console.error);
	 *
	 * @param {function} func node-style function that will be called
	 * @param {...*} [args] arguments that will be forwarded to the function
	 * @returns {Promise} promise for the value func passes to its callback
	 */
	function call(func /*, args... */) {
		return _apply(func, this, slice.call(arguments, 1));
	}

	/**
	 * Takes a node-style function and returns new function that wraps the
	 * original and, instead of taking a callback, returns a promise. Also, it
	 * knows how to handle promises given as arguments, waiting for their
	 * resolution before executing.
	 *
	 * Upon execution, the orginal function is executed as well. If it passes
	 * a truthy value as the first argument to the callback, it will be
	 * interpreted as an error condition, and the promise will be rejected
	 * with it. Otherwise, the call is considered a resolution, and the promise
	 * is resolved with the callback's second argument.
	 *
	 * @example
	 *    var fs = require("fs"), nodefn = require("when/node/function");
	 *
	 *    var promiseRead = nodefn.lift(fs.readFile);
	 *
	 *    // The promise is resolved with the contents of the file if everything
	 *    // goes ok
	 *    promiseRead('exists.txt').then(console.log, console.error);
	 *
	 *    // And will be rejected if something doesn't work out
	 *    // (e.g. the files does not exist)
	 *    promiseRead('doesnt_exist.txt').then(console.log, console.error);
	 *
	 *
	 * @param {Function} func node-style function to be bound
	 * @param {...*} [args] arguments to be prepended for the new function
	 * @returns {Function} a promise-returning function
	 */
	function lift(func /*, args... */) {
		var args = slice.call(arguments, 1);
		return function() {
			return _apply(func, this, args.concat(slice.call(arguments)));
		};
	}

	function liftAll(src, combine, dst) {
		return _liftAll(lift, combine, dst, src);
	}

	/**
	 * Takes an object that responds to the resolver interface, and returns
	 * a function that will resolve or reject it depending on how it is called.
	 *
	 * @example
	 *	function callbackTakingFunction(callback) {
	 *		if(somethingWrongHappened) {
	 *			callback(error);
	 *		} else {
	 *			callback(null, interestingValue);
	 *		}
	 *	}
	 *
	 *	var when = require('when'), nodefn = require('when/node/function');
	 *
	 *	var deferred = when.defer();
	 *	callbackTakingFunction(nodefn.createCallback(deferred.resolver));
	 *
	 *	deferred.promise.then(function(interestingValue) {
	 *		// Use interestingValue
	 *	});
	 *
	 * @param {Resolver} resolver that will be 'attached' to the callback
	 * @returns {Function} a node-style callback function
	 */
	function createCallback(resolver) {
		return _createCallback(resolver.resolve, resolver.reject);
	}

	function _createCallback(resolve, reject) {
		return function(err, value) {
			if(err) {
				reject(err);
			} else if(arguments.length > 2) {
				resolve(slice.call(arguments, 1));
			} else {
				resolve(value);
			}
		};
	}

	/**
	 * Attaches a node-style callback to a promise, ensuring the callback is
	 * called for either fulfillment or rejection. Returns a promise with the same
	 * state as the passed-in promise.
	 *
	 * @example
	 *	var deferred = when.defer();
	 *
	 *	function callback(err, value) {
	 *		// Handle err or use value
	 *	}
	 *
	 *	bindCallback(deferred.promise, callback);
	 *
	 *	deferred.resolve('interesting value');
	 *
	 * @param {Promise} promise The promise to be attached to.
	 * @param {Function} callback The node-style callback to attach.
	 * @returns {Promise} A promise with the same state as the passed-in promise.
	 */
	function bindCallback(promise, callback) {
		promise = when(promise);

		if (callback) {
			promise.then(success, wrapped);
		}

		return promise;

		function success(value) {
			wrapped(null, value);
		}

		function wrapped(err, value) {
			setTimer(function () {
				callback(err, value);
			}, 0);
		}
	}

	/**
	 * Takes a node-style callback and returns new function that accepts a
	 * promise, calling the original callback when the promise is either
	 * fulfilled or rejected with the appropriate arguments.
	 *
	 * @example
	 *	var deferred = when.defer();
	 *
	 *	function callback(err, value) {
	 *		// Handle err or use value
	 *	}
	 *
	 *	var wrapped = liftCallback(callback);
	 *
	 *	// `wrapped` can now be passed around at will
	 *	wrapped(deferred.promise);
	 *
	 *	deferred.resolve('interesting value');
	 *
	 * @param {Function} callback The node-style callback to wrap.
	 * @returns {Function} The lifted, promise-accepting function.
	 */
	function liftCallback(callback) {
		return function(promise) {
			return bindCallback(promise, callback);
		};
	}
});

})(
	typeof define === 'function' && define.amd ? define : function (factory) { module.exports = factory(require); }
	// Boilerplate for AMD and Node
);



