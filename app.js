function stellarContactsGo() {
    chrome.storage.local.get('contacts', function (result) {
        if (result) {
            console.debug("Нашли в локальном");
            const contacts = JSON.parse(result.contacts.replace(/^\s+\/\/.*\n/gm, ''));
            stellarContactsAction(contacts);
        }
    });
}

function stellarContactsAction(contacts) {
    console.debug("Начали работу поиска и замены.");

    // console.log(contacts);
    const reg = /G[A-Z2-7]{55}/;

    if (location.host === "stellar.expert") {
        jQuery('.account-key').each(function () {
            const $element = jQuery(this);
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
    } else if (
        location.toString().indexOf("https://gsa05.github.io/MTL_Association/") === 0
        || location.toString().indexOf("https://voleum-org.github.io/MTL_Association/") === 0
        || location.toString().indexOf("https://app.mtla.me/") === 0
        || location.toString().indexOf("https://bor.mtla.me/html") === 0
    ) {
        jQuery('a').each(function () {
            const $element = jQuery(this);
            const match = reg.exec($element.attr('href'));
            if (match && match[0] && contacts[match[0]]) {
                const account = match[0];
                const name = contacts[account];
                const start = account.substring(0, 4);
                const end = account.substring(account.length - 4);
                $element.text($element.text().replace(new RegExp(start + '.+' + end), name));
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
