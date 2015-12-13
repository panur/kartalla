/* Author: Panu Ranta, panu.ranta@iki.fi */

function Utils() {
    var that = this;

    this.downloadUrl = function (url, progressHandler, responseHandler) {
        var request = new XMLHttpRequest();
        request.addEventListener('progress', progressHandler);

        request.onreadystatechange = function () {
            if (request.readyState == 4) {
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
        if (url.indexOf('.json') != -1) {
            request.overrideMimeType('application/json');
        }
        request.send();
    }

  this.getHeading = function (point, polyline, zoom) {
    var tolerances = [0.0001, 391817 * Math.pow(0.445208, zoom)];

    for (var t = 0; t < tolerances.length; t++) {
      for (var i = 0; i < polyline.getPath().length - 1; i++) {
        var p1 = polyline.getPath().getAt(i);
        var p2 = polyline.getPath().getAt(i + 1);

        if (isPointInLineSegment(point, p1, p2, tolerances[t]) == true) {
          return computeHeading(p1, p2);
        }
      }
    }

    return -1;

    function isPointInLineSegment(point, p1, p2, tolerance) {
      var distance = Math.abs(getDistance(point, p1) + getDistance(point, p2) -
                              getDistance(p1, p2));
      return (distance < tolerance);

      function getDistance(from, to) {
        return google.maps.geometry.spherical.computeDistanceBetween(from, to);
      }
    }

    function computeHeading(from, to) {
      var heading = google.maps.geometry.spherical.computeHeading(from, to);

      if (heading < 0)  {
        heading += 360;
      }

      heading = Math.round(heading / 3) * 3;

      return heading;
    }
  }

  this.createDirectionMarker = function (point, heading) {
    var direction = getLineDirection(heading);
    var image = new google.maps.MarkerImage(
      "http://www.google.com/mapfiles/dir_" + direction + ".png",
      new google.maps.Size(24, 24), /* size */
      new google.maps.Point(0, 0), /* origin */
      new google.maps.Point(12, 12) /* anchor */
    );

    return new google.maps.Marker({
      position: point,
      icon: image
    });

    function getLineDirection(heading) {
      var direction = heading;

      while (direction >= 120) {
        direction -= 120;
      }

      return direction;
    }
  }
}
