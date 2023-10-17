function saveToStorage(options) {
  const $status = document.getElementById("status");
  chrome.storage.local.set(
    {
      contacts: options,
    },
    function () {
      // Update status to let user know options were saved.
      $status.textContent = "Options saved.";
      setTimeout(function () {
        $status.textContent = "";
        refresh();
      }, 1000);
    }
  );
}

function save_options() {
  let test = {};
  const $status = document.getElementById("status");
  try {
    const values = $("input")
      .slice(0, -1)
      .map((index, item) => item.value);
    for (let i = 0; i < values.length / 2; i++) {
      const id = values[i * 2];
      const name = values[i * 2 + 1];
      if (id) {
        test[id] = name;
      }
    }
  } catch (e) {
    $status.textContent = "JSON error. Not saved. " + e.message;
    setTimeout(function () {
      $status.textContent = "";
    }, 1000);
  }
  if (test) {
    saveToStorage(JSON.stringify(test));
  }
}

function export_options() {
  save_options();
  loadContacts().then((contacts) => {
    var blob = new Blob([contacts], {
      type: "application/json",
    });
    var url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url, // The object URL can be used as download URL
      filename: "StellarContacts.json",
    });
  });
}

function import_button() {
  if (importFile) {
    importFile.click();
  }
}

function import_options() {
  const file = this.files[0];
  if (file) {
    var reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      saveToStorage(text);
    };
    reader.readAsText(file);
  }
}

function getMsg(name) {
  return chrome.i18n.getMessage(name);
}

function loadContacts() {
  return new Promise(function (resolve) {
    chrome.storage.local.get("contacts", function (result) {
      if (result) {
        // console.info("Found in local.");
        resolve(result.contacts ? result.contacts : "");
      } else {
        // console.info("Found in sync.");
        chrome.storage.sync.get("contacts", function (result) {
          resolve(
            result.contacts ? result.contacts.replace(/^\s+\/\/.*\n/gm, "") : ""
          );
        });
      }
    });
  });
}

function refresh() {
  $("#header").text(getMsg("optYourContacts"));
  $("#btn_save").text(getMsg("optButtonSave"));
  $("#btn_export").text(getMsg("optButtonExport"));
  $("#btn_import").text(getMsg("optButtonImport"));
  $("#description").text(getMsg("optDescription"));
  const $contacts = $("#contacts");
  loadContacts().then(function (contacts) {
    //console.log(contacts);
    var objContacts = JSON.parse(contacts);
    $contacts.val(contacts);
    var myAppendGrid = new AppendGrid({
      element: "tblAppendGrid",
      columns: [
        {
          name: "id",
          display: getMsg("tableId"),
          type: "text",
        },
        {
          name: "label",
          display: getMsg("tableName"),
          type: "text",
        },
      ],
      i18n: {
        append: getMsg("tableAppend"),
        remove: getMsg("tableRemove"),
        rowEmpty: getMsg("tableEmpty"),
      },
      hideButtons: {
        removeLast: true,
        insert: true,
        moveUp: true,
        moveDown: true,
      },
      initData: Object.keys(objContacts).map((contact) => ({
        id: contact,
        label: objContacts[contact],
      })),
    });
  });
}

document.addEventListener("DOMContentLoaded", refresh);

document.getElementById("btn_save").addEventListener("click", save_options);
document.getElementById("btn_export").addEventListener("click", export_options);
document
  .getElementById("importFile")
  .addEventListener("change", import_options);
document.getElementById("btn_import").addEventListener("click", import_button);
