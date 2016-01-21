/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

/* Show markers on Google Maps
API Reference: https://developers.google.com/maps/documentation/javascript/reference
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
        s.symbolBaseSize = 15;
        s.nextMarkerId = 0;
        s.previousSymbolScale = null;
        return s;
    }

    this.init = function (lat, lng, zoomLevel) {
        var gmElement = document.getElementById('map_canvas');
        var gmOptions = {
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            mapTypeControlOptions: {style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR},
            zoomControlOptions: {style: google.maps.ZoomControlStyle.DEFAULT},
            panControl: true,
            zoomControl: true,
            scaleControl: true,
            streetViewControl: true,
            styles: [{
                featureType: 'road.arterial',
                elementType: 'geometry.fill',
                stylers: [{color: '#FBF8A5' }]
            }]
        };

        state.gm = new google.maps.Map(gmElement, gmOptions);
        state.gm.setOptions({center: new google.maps.LatLng(lat, lng), zoom: zoomLevel});
        state.gm.addListener('zoom_changed', zoomChanged);
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
            marker.gmMarker.resize(newScale * state.symbolBaseSize);
        }
    }

    this.restart = function (lat, lng, zoomLevel) {
        state.gm.setCenter({lat: lat, lng: lng});
        state.gm.setZoom(zoomLevel);
    }

    this.resize = function (newHeight) {
        state.gm.getDiv().style.height = newHeight + 'px';
        google.maps.event.trigger(state.gm, 'resize');
    };

    this.decodePath = function (encodedPath) {
        return google.maps.geometry.encoding.decodePath(encodedPath);
    };

    this.addMarker = function (path, pathId, isVisible, color) {
        var marker = createMarker(pathId);
        var symbolElement = createMarkerSymbolElement(isVisible, color, marker);

        if (state.polylineCache[pathId] === undefined) {
            var newPolyline = new google.maps.Polyline({
                path: path,
                visible: isVisible,
                geodesic: true,
                strokeColor: 'black',
                strokeOpacity: 0.6,
                strokeWeight: 1
            });
            state.polylineCache[pathId] = {polyline: newPolyline, count: 1};
        } else {
            state.polylineCache[pathId].count += 1;
        }

        marker.gmPolyline = state.polylineCache[pathId].polyline;

        marker.gmMarker = new SymbolMarker(state.gm, marker.gmPolyline);
        marker.gmMarker.init(createSymbolRootElement(symbolElement), isVisible,
                             getSymbolScale() * state.symbolBaseSize);

        marker.gmSymbol = {
            element: symbolElement,
            form: ''
        };

        return marker;
    };

    function createMarker(pathId) {
        var marker = {
            gmMarker: null, gmSymbol: null, gmPolyline: null, pathId: pathId,
            markerId: state.nextMarkerId, title: '',
            angle: 0  // 0-360, 0=north, 90=east, 180=south, 270=west
        };
        state.markers[state.nextMarkerId] = marker;
        state.nextMarkerId += 1;
        return marker;
    }

    function createMarkerSymbolElement(isVisible, color, marker) {
        var symbolElement = createSvgElement('g');
        symbolElement.style.visibility = getVisibilityString(isVisible);
        symbolElement.style.fill = color;
        symbolElement.addEventListener('mouseover', function () {
            updateSymbolTooltipElement(symbolElement, marker);
        });
        symbolElement.addEventListener('mouseout', function () {
            hideSymbolTooltipElement(symbolElement);

        });
        return symbolElement;
    }

    function getSymbolTooltipElement() {
        var elementId = 'markerSymbolTooltip';
        var symbolTooltipElement = document.getElementById(elementId);
        if (symbolTooltipElement === null) {
            symbolTooltipElement = createSymbolTooltipElement(elementId);
            document.body.appendChild(symbolTooltipElement);
        }
        return symbolTooltipElement;
    }

    function createSymbolTooltipElement(elementId) {
        var symbolTooltipElement = document.createElement('div');
        symbolTooltipElement.id = elementId;
        symbolTooltipElement.style.position = 'absolute';
        symbolTooltipElement.style.padding = '5px';
        symbolTooltipElement.style.whiteSpace = 'pre';
        symbolTooltipElement.style.background = 'linear-gradient(to bottom, khaki, white)';
        return symbolTooltipElement;
    }

    function updateSymbolTooltipElement(symbolElement, marker) {
        var rect = symbolElement.getBoundingClientRect();
        symbolElement.style.cursor = 'help';
        showSymbolTooltipElement(rect, marker.title);
    }

    function showSymbolTooltipElement(rect, title) {
        var symbolTooltipElement = getSymbolTooltipElement();
        symbolTooltipElement.textContent = title;
        symbolTooltipElement.style.visibility = 'visible';

        var leftOffset = {true: 0,
            false: symbolTooltipElement.offsetWidth}[rect.left < (window.innerWidth / 2)];
        symbolTooltipElement.style.left = (rect.left - leftOffset) + 'px';
        var topOffset = {true: -rect.height,
            false: symbolTooltipElement.offsetHeight}[rect.top < (window.innerHeight / 2)];
        symbolTooltipElement.style.top = (rect.top - topOffset) + 'px';
    }

    function hideSymbolTooltipElement(symbolElement) {
        var symbolTooltipElement = getSymbolTooltipElement();
        symbolTooltipElement.style.visibility = 'hidden';
        symbolElement.style.cursor = '';
    }

    function getVisibilityString(isVisible) {
        return {true: 'visible', false: 'hidden'}[isVisible];
    }

    function createSymbolRootElement(svgSymbolElement) {
        var wrapperElement = document.createElement('div');
        var svgRootElement = createSvgElement('svg');
        svgRootElement.setAttribute('viewBox', '0 0 10 10');
        svgRootElement.appendChild(svgSymbolElement);
        wrapperElement.appendChild(svgRootElement);
        return wrapperElement;
    }

    function createSvgElement(elementType) {
        return document.createElementNS('http://www.w3.org/2000/svg', elementType);
    }

    this.updateMarker = function (marker, distanceFromStart, opacity, title) {
        var distance = getPathPositionAndHeading(marker.gmPolyline.getPath(), distanceFromStart);

        var symbolForm = getSymbolForm(distanceFromStart, opacity);
        if (symbolForm !== marker.gmSymbol.form) {
            marker.gmSymbol.form = symbolForm;
            updateSymbol(marker.gmSymbol);
        }
        marker.gmSymbol.element.style.opacity = opacity;
        marker.gmSymbol.element.setAttribute('transform',
                                             'rotate(' + (distance.heading - 90) + ', 5, 5)');

        marker.title = title;
        marker.angle = distance.heading;

        marker.gmMarker.update(distance.position);
    };

    function getPathPositionAndHeading(path, distanceFromStart) {
        var cumulDistance = 0;

        for (var i = 1; i < path.getLength(); i++) {
            var p1 = path.getAt(i - 1);
            var p2 = path.getAt(i);
            var distanceInc = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
            cumulDistance += distanceInc;
            if (cumulDistance > distanceFromStart) {
                var distanceFromP1 = (distanceFromStart - (cumulDistance - distanceInc));
                var fraction = distanceFromP1 / distanceInc;
                var position = google.maps.geometry.spherical.interpolate(p1, p2, fraction);
                var heading = google.maps.geometry.spherical.computeHeading(p1, p2);
                return {position: position, heading: heading};
            }
        }

        var p1 = path.getAt(path.getLength() - 2);
        var p2 = path.getAt(path.getLength() - 1);
        return {position: p2, heading: google.maps.geometry.spherical.computeHeading(p1, p2)};
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
        if (gmSymbol.form === 'square') {
            var svgElement = createSvgElement('rect');
            svgElement.setAttribute('x', '2');
            svgElement.setAttribute('y', '2');
            svgElement.setAttribute('width', '6');
            svgElement.setAttribute('height', '6');
        } else if (gmSymbol.form === 'circle') {
            var svgElement = createSvgElement('circle');
            svgElement.setAttribute('cx', '5');
            svgElement.setAttribute('cy', '5');
            svgElement.setAttribute('r', '3');
        } else { // arrow ->
            var svgElement = createSvgElement('path');
            svgElement.setAttribute('d', 'M 2,2 8,5 2,8 4,5 z');
        }

        if (gmSymbol.element.firstChild !== null) {
            gmSymbol.element.removeChild(gmSymbol.element.firstChild);
        }
        gmSymbol.element.appendChild(svgElement);
    }

    this.removeMarker = function (marker) {
        marker.gmMarker.remove();
        marker.gmMarker = null;
        delete state.markers[marker.markerId];

        state.polylineCache[marker.pathId].count -= 1;
        if (state.polylineCache[marker.pathId].count === 0) {
            marker.gmPolyline.setMap(null);
            marker.gmPolyline = null;
            delete state.polylineCache[marker.pathId];
        }
    };

    this.setMarkerVisibility = function (marker, isVisible) {
        marker.gmSymbol.element.style.visibility = getVisibilityString(isVisible);
        marker.gmMarker.setVisibility(isVisible);
    };

    this.getDistances = function (path, pathIndexes) {
        var distances = [0];
        var distanceFromStart = 0;

        for (var i = 1, j = 1; i < path.length; i++) {
            var p1 = path[i - 1];
            var p2 = path[i];
            var distanceInc = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
            distanceFromStart += distanceInc;
            if (i === pathIndexes[j]) {
                j += 1;
                distances.push(Math.round(distanceFromStart));
            }
        }

        return distances;
    };

    this.getParams = function () {
        var center = state.gm.getCenter();
        return {'lat': center.lat(), 'lng': center.lng(), 'zoom': state.gm.getZoom()};
    };
}

function SymbolMarker(nativeMap, nativePolyline) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.latLng = null;
        s.symbolRootElement = null;
        s.size = null;
        return s;
    }

    this.init = function (symbolRootElement, isVisible, size) {
        symbolRootElement.style.position = 'absolute';
        state.symbolRootElement = symbolRootElement;
        that.setVisibility(isVisible);
        that.resize(size);
    };

    this.onAdd = function() {
        var panes = that.getPanes();
        panes.overlayImage.appendChild(state.symbolRootElement);
    };

    this.draw = function() {
        var projection = that.getProjection();
        if (projection !== undefined) {
            var point = projection.fromLatLngToDivPixel(state.latLng);
            if (point !== null) {
                state.symbolRootElement.style.left = (point.x - state.size / 2) + 'px';
                state.symbolRootElement.style.top = (point.y - state.size / 2) + 'px';
            }
        }
    };

    this.update = function(latLng) {
        state.latLng = latLng;
        if (that.getMap() === undefined) {
            that.setMap(nativeMap);
        }
        if (nativePolyline.getMap() === undefined) {
            nativePolyline.setMap(nativeMap);
        }
        that.draw();
    };

    this.onRemove = function() {
        state.symbolRootElement.parentNode.removeChild(state.symbolRootElement);
        state.symbolRootElement = null;
    };

    this.remove = function() {
        that.setMap(null);
    };

    this.resize = function(newSize) {
        state.size = newSize;
        state.symbolRootElement.style.width = newSize + 'px';
        state.symbolRootElement.style.height = newSize + 'px';
    };

    this.setVisibility = function (newIsVisible) {
        nativePolyline.setVisible(newIsVisible);
    };
}

SymbolMarker.prototype = new google.maps.OverlayView();
