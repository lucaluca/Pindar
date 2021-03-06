
/* for all pages */




// okay, here we go
$.fn.searchify = function(options){

  /* okay. so:
    with all the default settings, searchify runs on any div, as long as
    a text input #textQuery exists on the page. the default type is quotes.
    so $('.my-div').searchify() creates a text search on quotes.

    to have a default search, we need to make sure it is the same before and
    after advanced searches - if the order changes, it's weird. so to have
    a default set of results, have two divs - one that isDefault and will not
    be tied to search, another with isDefault = false and tied to your
    #textQuery.

    Default objects: these only run a search on page load, or if order is
    changed. they are NOT tied to text search boxes. however, their search
    function COULD be complex, e.g. quotes from a specific author.

    additionally, you could have advanced search. this typically does not
    have a Default div - just a simple div, searchified, with isAdvanced=true.
    advanced search does not search on text input, only on clicking a button.


  */

  var settings = $.extend({
    type: 'quotes',
    searchInput: $('#textQuery'), // make null when there is none
    searchFunction: function(){ return 'lookup=' + cleanSearchInput(settings.searchInput.val()); },
    objectsToShow: 5, // objects to show at first, and with each "More" button
    cols: 2,           // how many columns should quotes be in?
    pagination: true,  // paginate results; if not, cannot see objects past
                       // objectsToShow
    isDefault: false,  // true, if this object shows default content underneath
                       // another object with text search. default objects
                       // run one search on page load, and only run add'l
                       // searches when sort order is changed
    isAdvanced: false, // advanced search, with filters etc.
                       // advanced search objects MUST have a search box
    showAuthor: true,  // show the author of the works?
    highlightTerms: false,  // highlight search terms in results?
    searchOnLoad: true, // make this false for default divs when page loads
                        // with a search pending
    advancedSearchButton: $('.run-advanced-search'),
    onReturn: null,     // function callback to run on each object
    data: null
  }, options);

  var searchDiv = $(this);
  if (settings.isDefault){
    var defaultDiv = $('');
    searchInput = null; // no search input for default divs
  } else {
    var defaultDiv = searchDiv.parent('div').find('.default').first();
  }

  var countBadge = searchDiv.parent('div').find('.results-count');
  var showSpinner;

  // pagination variables
  var objectsStorage = [];
  var moreObjectsExist = false;
  var objectsOffset = 0;
  var objectsQuery = '';
  var objectsRetrieved = 0;
  // these need to be the same as the API limits in api.py
  var quotesAPILimit = 30, authorsAPILimit = 30, worksAPILimit = 30;

  // search variables
  var searching = false;
  var lastSearched = '';
  var pendingSearch;
  var searchInterval = undefined;

  var objectsFadeQueue = [];

  // hilitor
  var myHilitor;




  function buildBtnShowMore(objects){
    return $('<div class="col-md-8 col-md-offset-2">' +
    '<button type="button" class="btn btn-default btn-block btn-' + objects +
    '-more">Show more ' + objects + '</button></div>');
  }

  // this function creates searches from typing in a search box
  function handleSearchInput(el){
    if (!settings.isAdvanced){
      return function(){
        el.on('input', function(){
          // show search or default sections as appropriate
          if (cleanSearchInput(el.val()).length < 2){
            if (searchDiv.is(':visible')){
              console.log('hiding search div because input is too short');
              searchDiv.hide().empty();
              defaultDiv.show();
              updateCountBadge("");
            }
            settings.searchInput.siblings('.glyphicon-refresh').hide();
            clearTimeout(showSpinner);
          } else {
            console.log('input long enough; running search');
            // first, check that no searches are already running
            var query = settings.searchFunction();
            console.log('search box holds ' + settings.searchInput.val());
            console.log('cleaned input is ' + cleanSearchInput(settings.searchInput.val()));
            console.log('query is ' + settings.searchFunction());
            if (searching){
              clearTimeout(pendingSearch); // cancel any other timers
              // check every 200 ms for permission to search
              pendingSearch = setTimeout(function(){checkTimer(query)}, 100);
            } else {
              searching = true;
              // after 500 ms, allow add'l searches
              setTimeout(function(){searching=false;}, 400);
              lastSearched = query;
              runSearch(query);
            }
          }
        });

        // frequently check the input field, in case it's lagging behind search
        // searchInterval = window.setInterval(function(){
        //   if (lastSearched != settings.searchFunction()){
        //     el.trigger('input');
        //     console.log('triggering extra search');
        //   }
        // }, 750);
      };
    } else {
      return function(){
        settings.advancedSearchButton.on('click', function(e){
          e.preventDefault;
          var query = settings.searchFunction();
          if (searching){
            clearTimeout(pendingSearch);
            pendingSearch = setTimeout(function(){checkTimer(query)}, 100);
          } else {
            searching = true;
            setTimeout(function(){searching=false;}, 400);
            lastSearched = query;
            runSearch(query);
          }
        });
      };
    }
  }

  // this runs the search, or adds a search to the queue
  function queueSearch(query){
    if (searching){
      clearTimeout(pendingSearch);
      pendingSearch = setTimeout(function(){checkTimer(query)}, 100);
    } else {
      searching = true;
      setTimeout(function(){searching=false;}, 400);
      lastSearched = query;
      runSearch(query);
    }
  }

  // this pairs with queueSearch() to check back if currently searching,
  // or block other searches for 400 ms
  function checkTimer(newQuery){
    if (searching){
      pendingSearch = setTimeout(function(){checkTimer(newQuery)}, 100);
    } else {
      searching = true;
      setTimeout(function(){searching=false;}, 400);
      lastSearched = newQuery;
      // kill search if user has cleared the search field
      if (settings.searchInput){
        if (cleanSearchInput(settings.searchInput.val()).length > 1){
          console.log('there is text in search box, so running a search');
          runSearch(newQuery);
        }
      } else {
        console.log('no search box, but still running a search');
        runSearch(newQuery);
      }
    }
  }


  // routing function: this actually initiates the search and routes to
  // the appropriate query function
  function runSearch(query){
    console.log('running search');
    objectsQuery = query;
    objectsOffset = 0;
    objectsRetrieved = 0;
    // show spinner, but only if search hasn't returned within 100 ms
    if (!settings.isDefault){
      showSpinner = setTimeout(function(){
        settings.searchInput.siblings('.glyphicon-refresh').show();
      }, 400);
    }
    if (settings.type == 'quotes'){
      makeQuotesQuery(objectsQuery);
    } else if (settings.type == 'authors'){
      makeAuthorsQuery(objectsQuery);
    } else if (settings.type == 'works'){
      makeWorksQuery(objectsQuery);
    }
  }

  // when search is triggered from outside searchify, run search
  searchDiv.on('search', function(){
    var query = settings.searchFunction();
    queueSearch(query);
  });

  // inactivate search from outside searchify
  searchDiv.on('sleep', function(){
    if (settings.isAdvanced){
      settings.advancedSearchButton.off('click');
    } else if (settings.searchInput){
      settings.searchInput.off('input');
    }
    window.clearInterval(searchInterval);
    if (settings.searchInput){
      settings.searchInput.siblings('.glyphicon-refresh').hide();
    }
    clearTimeout(showSpinner);
  });

  // re-activate search from outside searchify
  searchDiv.on('wake', function(){
    if (settings.searchInput){
      handleSearchInput(settings.searchInput)();
    }
  });

  // auxiliary function to update the count badge
  function updateCountBadge(count){
    if (count !== undefined){
      countBadge.text(count);
      return true;
    }
    var currentCount = '';
    if (!settings.isDefault){
      if (moreObjectsExist){
        currentCount = (objectsRetrieved+1) + '+';
      } else {
        currentCount = objectsRetrieved;
      }
    }
    countBadge.text(currentCount);
    return true;
  }

  // turn search on
  if (settings.isDefault){
    // the searchify object is not meant to be searched after page load
    if (settings.searchOnLoad && !settings.data){
      // user has requested page to search upon loading
      searchDiv.trigger('search'); // load the default div with stuff
      searchDiv.html('<div class="text-center">' +
        '<i class="fa fa-spinner fa-2x fa-spin"></i></div>');
      // searchInterval = window.setInterval(function(){
      //   if (lastSearched != settings.searchFunction()){
      //     searchDiv.trigger('search');
      //     console.log('triggering search because of 1500ms check');
      //   }
      // }, 1500);
    } else if (settings.data){
      // already have some data
      var query = settings.searchFunction();
      objectsQuery = query;
      objectsOffset = 0;
      objectsRetrieved = 0;
      if (settings.type == 'quotes'){
        useQuotes(settings.data);
      } else if (settings.type == 'authors'){
        useAuthors(settings.data);
      } else if (settings.type == 'works'){
        useWorks(settings.data);
      }
    } else {
      // not default; user sees default on page load, so delay the search
      setTimeout(function(){
        searchDiv.trigger('search'); // load the default div with stuff
        // searchInterval = window.setInterval(function(){
        //   if (lastSearched != settings.searchFunction()){
        //     searchDiv.trigger('search');
        //     console.log('triggering search because of 1500ms check');
        //   }
        // }, 1500);
      }, 500);
    }
  } else if (settings.searchInput) {
    // not default; if user types in search box, run search
    console.log('we\'re handling search input');
    handleSearchInput(settings.searchInput)();
  } else {
    // no input field; no searching
  }



  function makeQuotesQuery(query){
    console.log('hitting /Pindar/api/quote_query?' + query);
    $.getJSON('/Pindar/api/quote_query?' + query,
      function(response) {
        if (query == settings.searchFunction()){ // if most recent search
        useQuotes(response.quotes);
      }
    });

  }

  function makeAuthorsQuery(query){
    console.log('hitting /Pindar/api/author_query?' + query);
    $.getJSON('/Pindar/api/author_query?' + query,
      function(response) {
      if (query == settings.searchFunction()){
      useAuthors(response.authors);
      }
    });
  }


  function makeWorksQuery(query){
    console.log('hitting /Pindar/api/work_query?' + query);
    $.getJSON('/Pindar/api/work_query?' + query,
      function(response) {
      if (query == settings.searchFunction()){
      useWorks(response.works);
      }
    });
  }


  function useQuotes(data){
    // unless this is default AND there's text in the box,
    // switch from default div to search div
    if (!(settings.isDefault && settings.searchInput && cleanSearchInput(settings.searchInput.val()).length)){
      console.log('showing quotes search div' + '\n\n\n');
      defaultDiv.hide();
      searchDiv.empty().show();
    }
    objectsStorage = []; // reset
    if (data.length > 0){
      var colWidth = parseInt(12 / settings.cols);
      for (var i=0; i<settings.cols; i++){
        searchDiv.append($('<div class="col-md-' + colWidth +
          ' column"></div>'));
      }
      console.log(data.length + ' quotes received from server');
      var quotesArray = parseQuotes(data);
      // console.log(quotesArray.length + ' quotes');
      if (quotesArray.length == quotesAPILimit){
        quotesArray.pop();
        moreObjectsExist = true;
        objectsOffset += quotesAPILimit - 1;
      } else {
        moreObjectsExist = false;
      }
      $.each(quotesArray, function(index, value){
        objectsStorage.push(value);
        objectsRetrieved += 1;
      });
      appendQuotes();
    } else {
      searchDiv.html('<div class="col-md-12"><p>No quotes found.</p></div>');
    }
    // unless this is default AND there's text in the box,
    // update count badge
    if (!(settings.isDefault && settings.searchInput &&
      cleanSearchInput(settings.searchInput.val()).length)){
      updateCountBadge();
    }
    if (settings.searchInput){
      settings.searchInput.siblings('.glyphicon-refresh').hide();
    }
    clearTimeout(showSpinner);

    // highlight search terms
    if (settings.highlightTerms && settings.searchInput &&
      cleanSearchInput(settings.searchInput.val()).length){
      myHilitor = new Hilitor(searchDiv[0].id);
      myHilitor.setMatchType("open");
      myHilitor.apply(cleanSearchInput(settings.searchInput.val()));
    }
  }

  function useAuthors(data){
    // show search div, but only if:
    //   a) it's not visible,
    //   b) this is not the default searchify, and
    //   c) there is still text in the search box (user hasn't deleted it)
    if (!(settings.isDefault && settings.searchInput &&
      cleanSearchInput(settings.searchInput.val()).length)){
      console.log('showing this authors search div' + '\n\n\n');
      defaultDiv.hide();
      searchDiv.empty().show();
    }
    objectsStorage = []; // reset
    if (data.length > 0){
      var authorsArray = parseAuthors(data, true, authorsAPILimit);
      if (authorsArray.length == authorsAPILimit){
        authorsArray.pop();
        moreObjectsExist = true;
        objectsOffset += authorsAPILimit - 1;
      } else {
        moreObjectsExist = false;
      }
      $.each(authorsArray, function(index, value){
        objectsStorage.push(value);
        objectsRetrieved += 1;
      });
      searchDiv.append('<div class="col-md-12 list-group"></div>');
      appendAuthors();
    } else {
      searchDiv.html('<div class="col-md-12"><p>No authors found.</p></div>');
    }
    // unless this is default AND there's text in the box,
    // update count badge
    if (!(settings.isDefault && settings.searchInput.val())){
      updateCountBadge();
    }
    if (settings.searchInput){
      settings.searchInput.siblings('.glyphicon-refresh').hide();
    }
    clearTimeout(showSpinner);

    // highlight search terms
    if (settings.highlightTerms && settings.searchInput &&
      cleanSearchInput(settings.searchInput.val()).length){
      myHilitor = new Hilitor(searchDiv[0].id);
      myHilitor.setMatchType("open");
      myHilitor.apply(cleanSearchInput(settings.searchInput.val()));
    }
  }

  function useWorks(data){
    // unless this is default AND there's text in the box,
    // update count badge
    if (!(settings.isDefault && settings.searchInput &&
      cleanSearchInput(settings.searchInput.val()).length)){
      console.log('showing works search div' + '\n\n\n');
      defaultDiv.hide();
      searchDiv.empty().show();
    }
    objectsStorage = []; // reset
    if (data.length > 0){
      var worksArray = parseWorks(data, true, settings.showAuthor,
        worksAPILimit);
      if (worksArray.length == worksAPILimit){
        worksArray.pop();
        moreObjectsExist = true;
        objectsOffset += worksAPILimit - 1;
      } else {
        moreObjectsExist = false;
      }
      $.each(worksArray, function(index, value){
        objectsStorage.push(value);
        objectsRetrieved += 1;
      });
      searchDiv.append('<div class="col-md-12 list-group"></div>');
      appendWorks();
    } else {
      searchDiv.html('<div class="col-md-12"><p>No works found.</p></div>');
    }
    // unless this is default AND there's text in the box,
    // update count badge
    if (!(settings.isDefault && settings.searchInput &&
      cleanSearchInput(settings.searchInput.val()).length)){
      updateCountBadge();
    }
    if (settings.searchInput){
      settings.searchInput.siblings('.glyphicon-refresh').hide();
    }
    clearTimeout(showSpinner);

    // highlight search terms
    if (settings.highlightTerms && settings.searchInput &&
      cleanSearchInput(settings.searchInput.val()).length){
      myHilitor = new Hilitor(searchDiv[0].id);
      myHilitor.setMatchType("open");
      myHilitor.apply(cleanSearchInput(settings.searchInput.val()));
    }
  }

  function appendQuotes(){
    var columns = searchDiv.find('.column');
    var minHeight = undefined;
    console.log(objectsStorage.length + ' objects in storage');
    for (var i=0; i<settings.objectsToShow; i++){
      if (!!objectsStorage.length){
        var q = objectsStorage.shift();
        q.quotify({size: 'small'});
        if (settings.onReturn){
          settings.onReturn(q);
        }
        // append to shortest column
        minHeight = [50000,-1];
        for (var c=0;c<columns.length;c++){
          if ($(columns[c]).height() < minHeight[0]){
            minHeight[0] = $(columns[c]).height();
            minHeight[1] = c;
          }
        }
        q.appendTo($(columns[minHeight[1]]));
        // objectsFadeQueue.push(q);
      }
    }
    console.log(objectsStorage.length + ' objects now in storage');
    // for (var q=0; q<objectsFadeQueue.length; q++){
    //   objectsFadeQueue[q].hide();
    // }
    if (settings.pagination & (!!objectsStorage.length | moreObjectsExist)){
      if (!searchDiv.find('.btn-' + settings.type + '-more').length){
        searchDiv.append(buildBtnShowMore('quotes'));
      }
    } else {
      searchDiv.find('.btn-' + settings.type + '-more').remove();
    }
  }


  function appendAuthors(){
    for (var i=0; i<settings.objectsToShow; i++){
      if (!!objectsStorage.length){
        var a = objectsStorage.shift();
        searchDiv.find('.list-group').append(a);
        // objectsFadeQueue.push(a);
        // a.hide();
      }
    }
    if (settings.pagination & (!!objectsStorage.length | moreObjectsExist)){
      if (!searchDiv.find('.btn-' + settings.type + '-more').length){
        searchDiv.append(buildBtnShowMore('authors'));
      }
    } else {
      searchDiv.find('.btn-' + settings.type + '-more').remove();
    }
  }


  function appendWorks(){
    for (var i=0; i<settings.objectsToShow; i++){
      if (!!objectsStorage.length){
        var w = objectsStorage.shift();
        searchDiv.find('.list-group').append(w);
        // objectsFadeQueue.push(w);
        // w.hide();
      }
    }
    if (settings.pagination & (!!objectsStorage.length | moreObjectsExist)){
      if (!searchDiv.find('.btn-' + settings.type + '-more').length){
        searchDiv.append(buildBtnShowMore('works'));
      }
    } else {
      searchDiv.find('.btn-' + settings.type + '-more').remove();
    }
  }

  // have objects fade in one by one
  // window.setInterval(function(){
  //   if (!!objectsFadeQueue.length){
  //     objectsFadeQueue.shift().fadeIn();
  //   }
  // }, 200);

  function showMoreObjects(){
    if (settings.type == 'quotes'){
      appendQuotes();
    } else if (settings.type == 'authors'){
      appendAuthors();
    } else if (settings.type == 'works'){
      appendWorks();
    }

    if (settings.highlightTerms){
      myHilitor.apply(cleanSearchInput(settings.searchInput.val()));
    }

    if (!!objectsStorage.length | moreObjectsExist){
      if (!searchDiv.find('.btn-' + settings.type + '-more').length){
        searchDiv.append(buildBtnShowMore(settings.type));
      }
    } else {
      searchDiv.find('.btn-' + settings.type + '-more').remove();
    }
  }


  function replenishObjects(){
    if (moreObjectsExist){
      console.log('replenishing objects');
      searchDiv.find('.btn-' + settings.type + '-more').
        html('<span class="text-center"><i class="fa fa-spinner fa-spin">' +
        '</i></span>').addClass('disabled');
      if (settings.type == 'quotes'){
        $.getJSON('/Pindar/api/quote_query?' + objectsQuery +
          '&offset=' + objectsOffset, function(response) {
          var quotesArray = parseQuotes(response.quotes);
          if (quotesArray.length == quotesAPILimit){
            quotesArray.pop();
            moreObjectsExist = true;
            objectsOffset += quotesAPILimit - 1;
          } else {
            moreObjectsExist = false;
          }
          $.each(quotesArray, function(index, value){
            objectsStorage.push(value);
            objectsRetrieved += 1;
          });
          showMoreObjects();
          updateCountBadge();
          searchDiv.find('.btn-' + settings.type + '-more').
            html('Show more ' + settings.type).removeClass('disabled');
        });
      } else if (settings.type == 'authors'){
        $.getJSON('/Pindar/api/author_query?' + objectsQuery +
          '&offset=' + objectsOffset, function(response){
          var authorsArray = parseAuthors(response.authors, true,
            authorsAPILimit);
          if (authorsArray.length == authorsAPILimit){
            authorsArray.pop();
            moreObjectsExist = true;
            objectsOffset += authorsAPILimit - 1;
          } else {
            moreObjectsExist = false;
          }
          $.each(authorsArray, function(index, value){
            objectsStorage.push(value);
            objectsRetrieved += 1;
          });
          showMoreObjects();
          updateCountBadge();
          searchDiv.find('.btn-' + settings.type + '-more').
            html('Show more ' + settings.type).removeClass('disabled');
        });
      } else if (settings.type == 'works'){
        $.getJSON('/Pindar/api/work_query?' + objectsQuery +
          '&offset=' + objectsOffset, function(response){
          var worksArray = parseWorks(response.works, unwrapped=true,
            author=true, worksAPILimit);
          if (worksArray.length == worksAPILimit){
            worksArray.pop();
            moreObjectsExist = true;
            objectsOffset += worksAPILimit - 1;
          } else {
            moreObjectsExist = false;
          }
          $.each(worksArray, function(index, value){
            objectsStorage.push(value);
            objectsRetrieved += 1;
          });
          showMoreObjects();
          updateCountBadge();
          searchDiv.find('.btn-' + settings.type + '-more').
            html('Show more ' + settings.type).removeClass('disabled');
        });
      }
    } else {
      // no more objects: pass
      console.log('error: called replenishObjects on end of list');
    }
  }



  searchDiv.on('click', '.btn-' + settings.type + '-more', function(){
    if ((objectsStorage.length < settings.objectsToShow) && moreObjectsExist){
      // replenish objects
      replenishObjects();
    } else {
      showMoreObjects(settings.type);
    }
    $(this).blur();
  });


};



