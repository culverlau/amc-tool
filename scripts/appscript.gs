var SCORES_SHEET_NAME = 'Scores';

function doGet(e) {
  if (e.parameter.sheet === 'scores') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SCORES_SHEET_NAME);
    if (!sheet) return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
    var data = sheet.getDataRange().getValues();
    var result = data.map(function(row) {
      return { amcId: String(row[0]), title: row[1] || '', rtScore: row[2] === '' ? null : Number(row[2]), rtSlug: row[3] || '', fetchedAt: row[4] || '' };
    }).filter(function(item) { return item.amcId; });
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rows = sheet.getDataRange().getValues();
  return ContentService.createTextOutput(
    JSON.stringify(rows.map(function(r) { return { showtimeId: r[0], name: r[1], rowMin: r[2] || 'E', rowMax: r[3] || 'L', seatMin: r[4] || 7, seatMax: r[5] || 36, availableSeats: r[6] || '' }; }).filter(function(r) { return r.showtimeId; }))
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);

  if (body.action === 'upsertScore') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SCORES_SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SCORES_SHEET_NAME);
    var data = sheet.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(body.amcId)) {
        sheet.getRange(i + 1, 1, 1, 5).setValues([[body.amcId, body.title, body.rtScore, body.rtSlug || '', body.fetchedAt]]);
        return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    sheet.appendRow([body.amcId, body.title, body.rtScore, body.rtSlug || '', body.fetchedAt]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'cleanupScores') {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SCORES_SHEET_NAME);
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    var keep = new Set(body.amcIds.map(String));
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 0; i--) {
      if (!keep.has(String(data[i][0]))) sheet.deleteRow(i + 1);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  }

  var action = body.action;
  var showtimeId = body.showtimeId;
  var name = body.name;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (action === 'add') {
    var data = sheet.getDataRange().getValues();
    var exists = data.some(function(row) { return String(row[0]) === String(showtimeId); });
    if (!exists) sheet.appendRow([showtimeId, name, body.rowMin || '', body.rowMax || '', body.seatMin || '', body.seatMax || '', '']);
  } else if (action === 'remove') {
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(showtimeId)) { sheet.deleteRow(i + 1); break; }
    }
  } else if (action === 'updateSeats') {
    var data = sheet.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(showtimeId)) {
        sheet.getRange(i + 1, 7).setValue(body.seats || '');
        break;
      }
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
