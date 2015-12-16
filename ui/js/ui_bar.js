/* Author: Panu Ranta, panu.ranta@iki.fi */

function UiBar() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.tripTypeInfos = null;
        return s;
    }

    this.init = function (tripTypeInfos) {
        state.tripTypeInfos = tripTypeInfos;

        var uiBarElement = document.getElementById('ui_bar');

        var line1Element = createElement('div');
        line1Element.appendChild(createElement('span', 'clock'));
        line1Element.appendChild(createTextElement(' | '));
        line1Element.appendChild(createTripTypeElement(tripTypeInfos.getTypes()));
        uiBarElement.appendChild(line1Element);

        var line2Element = createElement('div');
        line2Element.appendChild(createJsonDataElement());
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createAboutLinkElement());
        uiBarElement.appendChild(line2Element);
    }

    function createTripTypeElement(tripTypes) {
        var tripTypeElement = createElement('span');

        for (var tripTypeName in tripTypes) {
            var statisticsTitle = getStatisticsTitle(tripTypeName);
            if (tripTypeElement.hasChildNodes()) {
                statisticsTitle = ', ' + statisticsTitle;
            }
            var titleElement = createTextElement(statisticsTitle + ': ');
            titleElement.style.color = tripTypes[tripTypeName].color;
            tripTypeElement.appendChild(titleElement);
            var elementId = tripTypeName + 'Count';
            tripTypeElement.appendChild(createElement('span', elementId, '-'));
            var tripTypeVisibilityElement =
                createTripTypeVisibilityElement(tripTypeName, tripTypes[tripTypeName]);
            tripTypeElement.appendChild(tripTypeVisibilityElement);
        }

        return tripTypeElement;
    }

    function getStatisticsTitle(tripTypeName) {
        return {'bus': 'busseja', 'train': 'junia', 'tram': 'ratikoita',
                'metro': 'metroja', 'ferry': 'lauttoja'}[tripTypeName];
    }

    function createTripTypeVisibilityElement(tripTypeName, tripType) {
        var visibilityElement = createElement('span');
        updateTripTypeVisibilityElement(visibilityElement, tripType.isVisible);
        visibilityElement.className = 'visibilityButton';
        visibilityElement.addEventListener('click', function () {
            state.tripTypeInfos.toggleVisibility(tripTypeName);
            updateTripTypeVisibilityElement(visibilityElement, tripType.isVisible);
        });
        return visibilityElement;
    }

    function updateTripTypeVisibilityElement(visibilityElement, isVisible) {
        visibilityElement.textContent = {false: ' (n)', true: ' (p)'}[isVisible];
        visibilityElement.title = {false: 'näytä', true: 'piilota'}[isVisible];
    }

    function createJsonDataElement() {
        var jsonDataElement = createElement('span');
        jsonDataElement.appendChild(createTextElement('Data: '));
        jsonDataElement.appendChild(createElement('span', 'downloadStatus'));
        return jsonDataElement;
    }

    function createAboutLinkElement() {
        var aboutLinkElement = createElement('a', undefined, 'tietoja');
        aboutLinkElement.href = 'about/';
        return aboutLinkElement;
    }

    function createElement(elementType, elementId, textContent) {
        var newElement = document.createElement(elementType);
        if (elementId != undefined) {
            newElement.id = elementId;
        }
        if (textContent != undefined) {
            newElement.textContent = textContent;
        }
        return newElement;
    }

    function createTextElement(textContent) {
        return createElement('span', undefined, textContent);
    }

    function setElementText(elementId, textContent) {
        document.getElementById(elementId).textContent = textContent;
    }

    this.updateDownloadProgress = function (progressEvent) {
        var downloadStatus = 'ladataan...';
        if (progressEvent.lengthComputable) {
            downloadStatus = Math.round(100 * (progressEvent.loaded / progressEvent.total));
        }
        setElementText('downloadStatus', downloadStatus);
    }

    this.updateClock = function (date) {
        setElementText('clock', date.toLocaleDateString() + ' ' + date.toLocaleTimeString());
    }

    this.updateStatistics = function () {
        var tripTypes = state.tripTypeInfos.getTypes();
        for (var tripTypeName in tripTypes) {
            var elementId = tripTypeName + 'Count'
            setElementText(elementId, tripTypes[tripTypeName].count);
        }
    }
}
