/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function Utils() {
    var that = this;

    this.downloadUrl = function (url, progressHandler, responseHandler) {
        var request = new XMLHttpRequest();
        request.addEventListener('progress', progressHandler);

        request.onreadystatechange = function () {
            if (request.readyState === 4) {
                var status = request.status;
                if ((status === 0) || (status === 200)) {
                    responseHandler(request.responseText);
                    request.onreadystatechange = function () {};
                } else {
                    console.error('unexpected status: ' + status)
                }
            }
        }

        request.open('GET', url, true);
        if (url.indexOf('.json') !== -1) {
            request.overrideMimeType('application/json');
        }
        request.send();
    };
}
