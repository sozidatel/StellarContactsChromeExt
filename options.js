function save_options() {
    const contacts = document.getElementById('contacts').value;
    const $status = document.getElementById('status');
    let test = false;
    try {
        test = JSON.parse(contacts.replace(/^\s+\/\/.*\n/gm, ''));
    } catch (e) {
        $status.textContent = 'JSON error. Not saved. ' + e.message;
        setTimeout(function() {
            $status.textContent = '';
        }, 1000);
    }
    if (test) {
        chrome.storage.local.set({
            contacts: contacts
        }, function() {
            // Update status to let user know options were saved.
            $status.textContent = 'Options saved.';
            setTimeout(function() {
                $status.textContent = '';
            }, 1000);
        });
    }
}

function getMsg(name) {
    return chrome.i18n.getMessage(name);
}

function loadContacts()
{
    return new Promise(function (resolve) {
        chrome.storage.local.get('contacts', function (result) {
            if (result) {
                // console.info("Found in local.");
                resolve(result.contacts ? result.contacts : '');
            } else {
                // console.info("Found in sync.");
                chrome.storage.sync.get('contacts', function (result) {
                    resolve(result.contacts ? result.contacts.replace(/^\s+\/\/.*\n/gm, '') : '');
                });
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', function () {
    $('#header').text(getMsg("optYourContacts"));
    $('#btn_save').text(getMsg("optButtonSave"));
    $('#description').text(getMsg("optDescription"));
    const $contacts = $("#contacts");
    loadContacts().then(function (contacts) {
        // console.log(contacts);
        $contacts.val(contacts);
    });
});

document.getElementById('btn_save').addEventListener('click', save_options);
