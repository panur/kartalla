/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

/* Show markers on Leaflet
API Reference: http://leafletjs.com/reference.html
*/

'use strict';

function Map() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.gm = null;
        s.polylineCache = {};
        s.markers = {};
        s.symbolBaseSize = 10;
        s.nextMarkerId = 0;
        s.previousSymbolScale = null;
        return s;
    }

    this.init = function (lat, lng, zoomLevel) {
        var url = 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}';
        var mapbox = L.tileLayer(url, {
            attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> ' +
                'contributors, ' +
                '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                'Imagery &copy; <a href="http://mapbox.com">Mapbox</a>',
            maxZoom: 18,
            id: 'mapbox.streets',
            accessToken: 'pk.eyJ1IjoicGFudXIiLCJhIjoiY2lqMzZnZWJuMDAz' +
                'eXR0a25jYm84Y2M4ZCJ9.0JDpHBxZNybehgLgGBAO9g'
        });
        var osm = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        });
        var hsl = L.tileLayer('http://digitransit.fi/hsl-map/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: 'Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, ' +
                'Tiles &copy; <a href="http://digitransit.fi/">Digitransit</a>'
        });
        state.gm = L.map('map_canvas', {
            center: [lat, lng],
            zoom: zoomLevel,
            layers: [mapbox]
        });
        state.gm.on('zoomend', zoomChanged);

        var baseMaps = {
            'Mapbox': mapbox,
            'OpenStreetMap': osm,
            'HSL': hsl
        };

        L.control.layers(baseMaps).addTo(state.gm);

        state.previousSymbolScale = getSymbolScale();
    };

    function getSymbolScale() {
        var zoom = state.gm.getZoom();
        if (zoom < 12) {
            return 1;
        } else if (zoom < 14) {
            return 2;
        } else if (zoom < 15) {
            return 3;
        } else {
            return 4;
        }
    }

    function zoomChanged() {
        var newScale = getSymbolScale();
        if (newScale !== state.previousSymbolScale) {
            updateSymbolScales(newScale);
        }
        state.previousSymbolScale = newScale;
    }

    function updateSymbolScales(newScale) {
        for (var markerId in state.markers) {
            var marker = state.markers[markerId];
            marker.gmSymbol.scale = newScale;
            if (marker.gmSymbol.form !== '') {
                updateSymbol(marker.gmSymbol);
                var icon = marker.gmMarker.options.icon;
                setIconSize(icon.options, newScale);
                marker.gmMarker.setIcon(icon);
            }
        }
    }

    this.restart = function (lat, lng, zoomLevel) {
        state.gm.setView([lat, lng], zoomLevel);
    }

    this.resize = function (newHeight) {
        state.gm.getContainer().style.height = newHeight + 'px';
        state.gm.invalidateSize();
    };

    this.decodePath = function (encodedPath) {
        return decodeLine(encodedPath);
    };

    // http://code.google.com/apis/maps/documentation/utilities/include/polyline.js
    // Decode an encoded polyline into a list of latLng.
    function decodeLine(encoded) {
        var len = encoded.length;
        var index = 0;
        var array = [];
        var lat = 0;
        var lng = 0;

        while (index < len) {
            var b;
            var shift = 0;
            var result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            shift = 0;
            result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lng += dlng;

            array.push(L.latLng(lat * 1e-5, lng * 1e-5));
        }

        return array;
    }

    this.addMarker = function (path, pathId, isVisible, color) {
        var symbolScale = getSymbolScale();
        var iconElement = createMarkerIconElement(isVisible, color);
        var gmMarker = L.marker(path[0], {
            icon: createMarkerIcon(iconElement, symbolScale)
        });
        var gmSymbol = {
            element: iconElement,
            form: '',
            scale: symbolScale
        };
        if (state.polylineCache[pathId] === undefined) {
            var newPolyline = L.polyline(path, {
                color: 'black',
                opacity: 0.6,
                weight: 1
            });
            state.polylineCache[pathId] = {polyline: newPolyline, count: 1};
        } else {
            state.polylineCache[pathId].count += 1;
        }

        var gmPolyline = state.polylineCache[pathId].polyline;
        var marker = {gmMarker: gmMarker, isMarkerOnMap: false, gmSymbol: gmSymbol,
            gmPolyline: gmPolyline, isPolylineOnMap: false, pathId: pathId,
            markerId: state.nextMarkerId};
        state.markers[state.nextMarkerId] = marker;
        state.nextMarkerId += 1;
        return marker;
    };

    function createMarkerIconElement(isVisible, color) {
        var iconElement = document.createElement('div');
        iconElement.style.visibility = getVisibilityString(isVisible);
        iconElement.style.color = color;
        return iconElement;
    }

    function getVisibilityString(isVisible) {
        return {true: 'visible', false: 'hidden'}[isVisible];
    }

    function createMarkerIcon(iconElement, symbolScale) {
        var wrapperElement = document.createElement('div');
        wrapperElement.style.cursor = 'grab';
        wrapperElement.appendChild(iconElement);
        var iconOptions = {domElement: wrapperElement, className: '', clickable: false};
        setIconSize(iconOptions, symbolScale);
        return new DomIcon(iconOptions);
    }

    function setIconSize(iconOptions, symbolScale) {
        var size = symbolScale * state.symbolBaseSize;
        iconOptions.iconSize = new L.Point(size * 2, size);
        iconOptions.iconAnchor = new L.Point(size, size / 2);
    }

    var DomIcon = L.DivIcon.extend({
        options: {
            domElement: null
        },

        createIcon: function(oldIcon) {
            var div = (oldIcon && (oldIcon.tagName === 'DIV')) ? oldIcon : this.options.domElement;
            this._setIconStyles(div, 'icon');
            return div;
        }
    });

    this.updateMarker = function (marker, distanceFromStart, opacity, title) {
        var distance = getPathPositionAndHeading(marker.gmPolyline.getLatLngs(), distanceFromStart);

        var symbolForm = getSymbolForm(distanceFromStart, opacity);
        if (symbolForm !== marker.gmSymbol.form) {
            marker.gmSymbol.form = symbolForm;
            updateSymbol(marker.gmSymbol);
        }
        marker.gmSymbol.element.style.opacity = opacity;
        marker.gmSymbol.element.style.transform = 'rotate(' + (distance.heading - 90) + 'deg)';
        marker.gmSymbol.element.title = title;

        marker.gmMarker.setLatLng(distance.position);
        marker.gmMarker.update();

        if (marker.isMarkerOnMap === false) {
            marker.isMarkerOnMap = true;
            marker.gmMarker.addTo(state.gm);
        }

        if ((marker.isPolylineOnMap === false) &&
            (marker.gmSymbol.element.style.visibility === 'visible')) {
            marker.isPolylineOnMap = true;
            marker.gmPolyline.addTo(state.gm);
        }
    };

    function getPathPositionAndHeading(path, distanceFromStart) {
        var cumulDistance = 0;

        for (var i = 1; i < path.length; i++) {
            var p1 = path[i - 1];
            var p2 = path[i];
            var distanceInc = p1.distanceTo(p2);
            cumulDistance += distanceInc;
            if (cumulDistance > distanceFromStart) {
                var distanceFromP1 = (distanceFromStart - (cumulDistance - distanceInc));
                var fraction = distanceFromP1 / distanceInc;
                var position = interpolate(p1, p2, fraction);
                var heading = computeHeading(p1, p2);
                return {position: position, heading: heading};
            }
        }

        var p1 = path[path.length - 2];
        var p2 = path[path.length - 1];
        return {position: p2, heading: computeHeading(p1, p2)};
    }

    // based on http://www.movable-type.co.uk/scripts/latlong.html
    function interpolate(p1, p2, fraction) {
        var radius = 6378137; // earth's radius in meters
        var d = p1.distanceTo(p2) / radius;
        var lat1 = p1.lat * L.LatLng.DEG_TO_RAD;
        var lon1 = p1.lng * L.LatLng.DEG_TO_RAD;
        var lat2 = p2.lat * L.LatLng.DEG_TO_RAD;
        var lon2 = p2.lng * L.LatLng.DEG_TO_RAD;
        var A = Math.sin((1 - fraction) * d) / Math.sin(d);
        var B = Math.sin(fraction * d) / Math.sin(d);
        var x = ((A * Math.cos(lat1)) * Math.cos(lon1)) + ((B * Math.cos(lat2)) * Math.cos(lon2));
        var y = ((A * Math.cos(lat1)) * Math.sin(lon1)) + ((B * Math.cos(lat2)) * Math.sin(lon2));
        var z =  (A * Math.sin(lat1))                   +  (B * Math.sin(lat2));
        var lat = Math.atan2(z, Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
        var lon = Math.atan2(y, x);
        return L.latLng(lat * L.LatLng.RAD_TO_DEG, lon * L.LatLng.RAD_TO_DEG);
    }

    // based on http://www.movable-type.co.uk/scripts/latlong.html
    function computeHeading(p1, p2) {
        var lat1 = p1.lat * L.LatLng.DEG_TO_RAD;
        var lon1 = p1.lng * L.LatLng.DEG_TO_RAD;
        var lat2 = p2.lat * L.LatLng.DEG_TO_RAD;
        var lon2 = p2.lng * L.LatLng.DEG_TO_RAD;

        var y = Math.sin(lon1 - lon2) * Math.cos(lat2);
        var x = (Math.cos(lat1) * Math.sin(lat2)) -
            (Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon1 - lon2));
        var angle = - Math.atan2(y ,x);

        if (angle < 0.0) {
            angle += Math.PI * 2.0;
        }

        return angle * L.LatLng.RAD_TO_DEG;
    }

    function getSymbolForm(distanceFromStart, opacity) {
        if (distanceFromStart === 0) {
            return 'square';
        } else {
            if (opacity < 1) {
                return 'circle';
            } else {
                return 'arrow';
            }
        }
    }

    function updateSymbol(gmSymbol) {
        var elementStyle = gmSymbol.element.style;
        var size = state.symbolBaseSize * gmSymbol.scale;
        var half_size = size / 2;

        if (gmSymbol.form === 'square') {
            elementStyle.width = size + 'px';
            elementStyle.height = size+ 'px';
            elementStyle.left = half_size + 'px';
            elementStyle.position = 'absolute';
            elementStyle.backgroundColor = elementStyle.color;
        } else if (gmSymbol.form === 'circle') {
            elementStyle.width = size + 'px';
            elementStyle.height = size + 'px';
            elementStyle.left = half_size + 'px';
            elementStyle.position = 'absolute';
            elementStyle.backgroundColor = elementStyle.color;
            elementStyle.border = '';
            elementStyle.borderRadius = '50%';
        } else { // arrow ->
            elementStyle.width = '';
            elementStyle.height = '';
            elementStyle.left = '';
            elementStyle.position = '';
            elementStyle.backgroundColor = '';
            elementStyle.borderTop = half_size + 'px solid transparent';
            elementStyle.borderBottom = half_size + 'px solid transparent';
            elementStyle.borderLeft = size + 'px solid ' + elementStyle.color;
        }
    }

    this.removeMarker = function (marker) {
        state.gm.removeLayer(marker.gmMarker);
        marker.gmMarker = null;
        delete state.markers[marker.markerId];

        state.polylineCache[marker.pathId].count -= 1;
        if (state.polylineCache[marker.pathId].count === 0) {
            state.gm.removeLayer(marker.gmPolyline);
            marker.gmPolyline = null;
            delete state.polylineCache[marker.pathId];
        }
    };

    this.setMarkerVisibility = function (marker, isVisible) {
        marker.gmSymbol.element.style.visibility = getVisibilityString(isVisible);
        if (isVisible === true) {
            if (marker.isPolylineOnMap === false) {
                marker.isPolylineOnMap = true;
                marker.gmPolyline.addTo(state.gm);
            }
        } else {
            if (marker.isPolylineOnMap === true) {
                marker.isPolylineOnMap = false;
                state.gm.removeLayer(marker.gmPolyline);
            }
        }
    };

    this.getDistances = function (path, pathIndexes) {
        var distances = [0];
        var distanceFromStart = 0;

        for (var i = 1, j = 1; i < path.length; i++) {
            var p1 = path[i - 1];
            var p2 = path[i];
            var distanceInc = p1.distanceTo(p2);
            distanceFromStart += distanceInc;
            if (i === pathIndexes[j]) {
                j += 1;
                distances.push(Math.round(distanceFromStart));
            }
        }

        return distances;
    };
}
