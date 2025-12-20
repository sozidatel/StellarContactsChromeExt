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

    if ([
        "bsn.expert",
        "stellar.expert",
        "crowd.mtla.me",
        "eurmtl.me",
        "viewer.eurmtl.me"
    ].includes(location.host)) {
        console.debug("Знакомый адрес: " + location.toString());
        jQuery('a').each(function () {
            const $element = jQuery(this);
            const match = /\/(G[A-Z2-7]{55})/.exec($element.attr('href'));
            if (match && match[1] && contacts[match[1]]) {
                console.debug("Найдена ссылка: " + $element.attr('href'));
                processLink($element, match[1], contacts[match[1]]);
            }
        });
    } else if (location.host === "lab.stellar.org") {
        jQuery('.PrettyJson__value--string').each(function () {
            const $element = jQuery(this);
            $element.text($element.text().replace(reg, function (match) {
                console.log(match);
                if (match && contacts[match]) {
                    return match + " [" + contacts[match] + "]";
                } else return match;
            }))
        });
    }

    function processLink($link, account, name) {
        if ($link.hasClass('stellar-contact-done')) return;
        const text = $link.text();
        if (!text) return;
        if (text.indexOf("📒") !== -1) return;

        const start = account.substring(0, 2);
        const end = account.substring(account.length - 2);
        const lastSix = account.substring(account.length - 6);

        const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const shortAccountRegExp = new RegExp(`${escapedStart}\\S*?${escapedEnd}`);
        const match = text.match(shortAccountRegExp);

        if (match) {
            const replacement = `${start}…${lastSix} [📒 ${name}]`;
            $link.text(text.replace(match[0], replacement)).addClass('stellar-contact-done');
        }
    }
}

chrome.runtime.onMessage.addListener(function() {
    stellarContactsGo();
});
