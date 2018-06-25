function isEmptyGridFilter(filter) {
   var isEmpty = true;
   $.each(filter, function () {
     $.each(this, function (prop, value) {
        if (value != "") {
           isEmpty = false;
           return false;
        }
     });
   });
   return isEmpty;
}

function applyGridFilter(filter, item) {
  if (!filter || !item)
    return false;
  for (var prop in filter) {
    if (typeof filter[prop] === "object") { //look for nested
      if (applyGridFilter(filter[prop], item[prop]))
        return true;
      continue;
    }
    var regexp = new RegExp(filter[prop], 'gi');
    if (filter[prop] && filter[prop].length>0) {
      if (item[prop] && item[prop].match(regexp))
        return true;
    }
  }
  return false;
}

$(document).ready(function(){
  jsGrid.Grid.prototype._sortData = function () { //compensate sorting bug for nested data
    var self = this,
    sortFactor = this._sortFactor(),
    sortField = this._sortField;
    if (sortField) {
      this.data.sort(function (item1, item2) {
        var value1 = self._getItemFieldValue(item1, sortField);
        var value2 = self._getItemFieldValue(item2, sortField);
        return sortFactor * sortField.sortingFunc(value1, value2);
      });
    }
   };

   if (window.localInit) {
     localInit();
   }
 });
