function stellarContactsGo() {
    chrome.storage.local.get('contacts', function (result) {
        if (result) {
            console.info("Нашли в локальном");
            const contacts = JSON.parse(result.contacts.replace(/^\s+\/\/.*\n/gm, ''));
            stellarContactsAction(contacts);
        } else {
            chrome.storage.sync.get('contacts', function (result) {
                console.info("Нашли в синке.");
                const contacts = JSON.parse(result.contacts.replace(/^\s+\/\/.*\n/gm, ''));
                stellarContactsAction(contacts);
            });
        }
    });

    chrome.storage.sync.get({
        contacts: '{}'
    }, function (items) {
        const contacts = JSON.parse(items.contacts.replace(/^\s+\/\/.*\n/gm, ''));
        stellarContactsAction(contacts);
    });
}

function stellarContactsAction(contacts) {
    // console.log(contacts);
    const reg = /G[A-Z2-7]{55}/;

    if (location.host === "stellar.expert") {
        jQuery('.account-key').each(function () {
            const $element = jQuery(this);
            const key = $element.attr('title');
            let name = null;
            if (name = contacts[$element.text()]) {
                $element.text(name);
            } else if (name = contacts[$element.parent().attr('title')]) {
                $element.text(name);
            }
            // atob
        });
    } else if (location.host === "mtl.ergvein.net") {
        jQuery('.signer-key').each(function () {
            const $element = jQuery(this);
            const key = $element.attr('href');
            const match = reg.exec(key);
            if (match[0] && contacts[match[0]]) {
                $element.text(contacts[match[0]]);
            }
        });
    } else if (location.host === "eurmtl.me") {
        jQuery('a').each(function () {
            const $element = jQuery(this);
            const match = reg.exec($element.attr('href'));
            if (match && match[0] && contacts[match[0]]) {
                $element.text(contacts[match[0]]);
            }
        });
        jQuery('.head-address').each(function () {
            const $element = jQuery(this);
            const key = $element.attr('title');
            if (key && contacts[key]) {
                $element.text(contacts[key]);
            }
        });
    } else if (location.toString().indexOf("https://github.com/montelibero-org/") === 0) {
        jQuery('.type-json .blob-code span').each(function () {
            const $element = jQuery(this);
            $element.html($element.html().replace(reg, function (match) {
                console.log(match);
                if (match && contacts[match]) {
                    return contacts[match];
                } else return match;
            }))
        });
    } else if (location.toString().indexOf("https://gsa05.github.io/MTL_Association/") === 0) {
        jQuery('a').each(function () {
            const $element = jQuery(this);
            const match = reg.exec($element.attr('href'));
            if (match && match[0] && contacts[match[0]]) {
                $element.text(contacts[match[0]]);
            }
        });
    } else if (location.host === "laboratory.stellar.org") {
        jQuery('.EasySelect code').each(function () {
            const $element = jQuery(this);
            $element.text($element.text().replace(reg, function (match) {
                console.log(match);
                if (match && contacts[match]) {
                    return contacts[match];
                } else return match;
            }))
        });
    }
}

chrome.runtime.onMessage.addListener(function() {
    stellarContactsGo();
});
