!(function(global){
    'use strict';
    if (global.Qoncrete)
        throw new Error('`Qoncrete` is already defined in the global namespace!');

    var baseEndpoint = 'https://log.qoncrete.com';

    var sourceID = null;
    var apiToken = null;
    var sendLogEndpoint = null;

    var TIME = { SECOND: 1000 };
    var defaultTimeoutAfter = 15 * TIME.SECOND;

    var ERRORS = {
        INVALID_BODY: 'INVALID_BODY',
        TIMEDOUT: 'TIMEDOUT',
        CLIENT_ERROR: 'CLIENT_ERROR',
        SERVER_ERROR: 'SERVER_ERROR',
        NETWORK_ERROR: 'NETWORK_ERROR'
    };
    var REQUESTSTATE = {
        DONE: 4
    };

    // opts: {
    //   sourceID: UUID string
    //   apiToken: UUID string
    // }
    function Qoncrete(opts) {
        opts = validateQoncrete(opts);
        sourceID = opts.sourceID;
        apiToken = opts.apiToken;
        sendLogEndpoint = baseEndpoint + '/' + sourceID + '?token=' + apiToken;
    }

    function validateQoncrete(opts) {
        if (!(opts && opts.sourceID && opts.apiToken))
            throw new QoncreteError(ERRORS.CLIENT_ERROR, '`sourceID` and `apiToken` must be specified.');

        opts.sourceID = opts.sourceID.toLowerCase();
        opts.apiToken = opts.apiToken.toLowerCase();
        if (!(isUUID(opts.sourceID) && isUUID(opts.apiToken)))
            throw new QoncreteError(ERRORS.CLIENT_ERROR, '`sourceID` and `apiToken` must be valid UUIDs.');

        return opts;
    }

    Qoncrete.prototype.send = function(data, opts, callback) {
        opts = opts || {};
        opts.body = data;

        if (typeof callback !== 'function')
            return new SendLogRequest(opts);

        return new SendLogRequest(opts).
            onSuccess(callback).
            onError(callback).
            done();
    };

    function SendLogRequest(opts) {
        this.timeoutAfter = opts.timeoutAfter || defaultTimeoutAfter;
        this.retryOnTimeout = opts.retryOnTimeout || 0;
        this.request = new XMLHttpRequest();
        this.body = opts.body;
        return this;
    }

    SendLogRequest.prototype.onSuccess = function(callback) {
        if (typeof callback !== 'function')
            callback = noop;

        this.onSuccess = callback;
        return this;
    };

    SendLogRequest.prototype.onError = function(callback) {
        if (typeof callback !== 'function')
            callback = noop;

        this.onError = callback;
        return this;
    };

    SendLogRequest.prototype.done = function() {
        try {
            this.body = JSON.stringify(this.body);
        } catch (ex) {
            return this.onError(new QoncreteError(ERRORS.INVALID_BODY, ex));
        }
        this.request.ontimeout = onSendLogTimeout.bind(this);
        this.request.onload = onSendLogLoad.bind(this);
        this.request.onerror = onSendLogNetworkError.bind(this);
        this.request.open('GET', sendLogEndpoint + '&body=' + encodeURIComponent(this.body), true);
        this.request.timeout = this.timeoutAfter;
        this.request.send(null);
    };

    function onSendLogTimeout() {
        if (this.retryOnTimeout <= 0) {
            return this.onError(new QoncreteError(ERRORS.TIMEDOUT, 'The request took too long time.'));
        }

        return new SendLogRequest({
            timeoutAfter: this.timeoutAfter,
            retryOnTimeout: this.retryOnTimeout - 1,
            body: this.body
        }).
        onSuccess(this.onSuccess).
        onError(this.onError).
        done();
    }

    function onSendLogLoad() {
        var req = this.request;

        if (req.readyState !== REQUESTSTATE.DONE)
            return;
        if (req.status === 204)
            return this.onSuccess();

        var errorType = (req.status >= 400 && req.status < 500) ? ERRORS.CLIENT_ERROR : ERRORS.SERVER_ERROR;

        return this.onError(new QoncreteError(errorType, req.responseText));
    }

    function onSendLogNetworkError(err) {
        this.onError(new QoncreteError(ERRORS.NETWORK_ERROR, err));
    }

    function QoncreteError(code, message) {
        this.code = code;
        this.message = message;
        this.stack = this.name + ' at ' + new Error().stack.match(/[^\s]+$/);
    }

    Object.setPrototypeOf(QoncreteError, Error);
    QoncreteError.prototype = Object.create(Error.prototype);
    QoncreteError.prototype.name = 'QoncreteError';
    QoncreteError.prototype.message = '';
    QoncreteError.prototype.constructor = QoncreteError;

    function noop() {}
    function isUUID(id) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
    }

    global.Qoncrete = Qoncrete;
}(this));
