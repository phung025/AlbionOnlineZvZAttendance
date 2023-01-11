const { ipcRenderer } = require('electron');
const axios = require('axios');
const echarts = require('echarts');
console.log("Loading player.js");

ipcRenderer.on('store-data', function (event, store) {
  parameters = JSON.parse(store);
  for (const key in parameters) {
    window[key] = parameters[key];
  }
  document.title = `Player ZvZ Detail: ${player[1]}`;

  // Init the battle table first before getting summary so that the object battles will contain all kill/death events of the selected player
  initBattleTable().then(() => {
    initPlayerSummary();
  });
});

const ALBION_API_URL = 'https://gameinfo.albiononline.com/api/gameinfo';
const DIV_PLAYER_OVERVIEW = 'div#overview';

$('#donation').textMarquee({
  mode: 'loop'
});

function initPlayerSummary() {
  $(`${DIV_PLAYER_OVERVIEW} h2#name`).text(player[1]);
  $(`${DIV_PLAYER_OVERVIEW} h5#guildName`).text(`[${player[3]}] ${player[2]}`);

  // Get all weapons the player play
  let playerID = player[0];
  let weapons = [];
  battles.forEach(battle => { // For each battle
    if ('playerEvents' in battle) { // If the selected player has kill/death events in the current battle
      battle.playerEvents.forEach(event => { // For each of those events
        if (event.Killer.Id === playerID) {
          weapons.push(event.Killer.Equipment.MainHand?.Type);
        } else {
          weapons.push(event.Victim.Equipment.MainHand?.Type);
        }
      });
    }
  });
  weapons = weapons.filter(x => x !== undefined);

  // Reduce to a set of weapons
  weapons = Array.from(new Set(weapons));
  weapons.sort();

  // Render weapons list
  weaponsHTML = weapons.map(x => `<img src="https://render.albiononline.com/v1/item/${x}.png?size=50"/>`).join('');
  $(`${DIV_PLAYER_OVERVIEW} span#allWeapons`).show()
  $(`${DIV_PLAYER_OVERVIEW} div#allWeapons`).html(weaponsHTML);
}

async function initBattleTable() {
  // Go through the list of battles and pick only battles that the player appeared in
  $.blockUI({ message: `<div class="spinner-border" role="status"></div> Generating Battle Statistic for ${player[1]}...` });
  let playerID = player[0]
  let attendedBattles = {};
  battles.forEach(battle => {
    if (playerID in battle.players) {
      attendedBattles[battle.id] = battle;
    }
  })

  // Generate summary table
  // BattleID, StartTime, TotalKillFameOfPlayer, TotalDeathFameOfPlayer, TotalKillsOfPlayer, TotalDeathOfPlayer
  let battleSummary = Object.keys(attendedBattles).map(battleID => {
    let startTime = new Date(attendedBattles[battleID].startTime);
    return ['', battleID, startTime, 0, 0, 0, 0];
  });

  // Get detail info of each battle
  for (const battleID in attendedBattles) {
    let offset = 0;
    let done = false;
    let playerEvents = [];
    while (!done) {
      await axios.get(ALBION_API_URL + `/events/battle/${battleID}?offset=${offset}&limit=51`).then(response => {
        if (response.status == 200) {
          // Get all kill events
          let killEvents = response.data;
          done = (killEvents.length == 0) ? true : false;
          if (done) {
            return;
          }
          offset += 51;

          // Process kill events to get only the one that involves the current player
          playerEvents = playerEvents.concat(killEvents.filter(event => (event.Killer.Id === playerID || event.Victim.Id === playerID)));
        }
      }).catch(error => {
        console.log(`Error while fetching battle ${battleID} kills:`, error);
      });
    }
    attendedBattles[battleID].playerEvents = playerEvents;
  };

  // Fill the battle summary array
  battleSummary.forEach(battle => {
    let battleID = battle[1];
    let playerEvents = attendedBattles[battleID].playerEvents;
    playerEvents.forEach(event => {
      if (event.Killer.Id === playerID) {
        battle[5] += 1; // Increase 1 kill count
        battle[3] += event.Killer.KillFame;
      } else {
        battle[6] += 1; // Increase 1 death count
        battle[4] += event.Victim.DeathFame;
      }
    });
  })

  // Fill subrows: specific kill / death event
  function format(rowData) {
    let battleID = rowData[1];
    let currentBattle = attendedBattles[battleID];
    allEventsHTML = currentBattle.playerEvents.map((event, i) => {
      let eventHTML = '<tr>';
      eventHTML += `<td><a href="https://albiononline.com/en/killboard/kill/${event.EventId}" target="_blank">${event.EventId}</a></td>`;
      eventHTML += `<td>${(new Date(event.TimeStamp)).toUTCString().split(' ')[4]}</td>`

      let killerMainHand = (event.Killer.Equipment.MainHand?.Type === undefined) ? '' : `<img src="https://render.albiononline.com/v1/item/${event.Killer.Equipment.MainHand.Type}.png?size=50&quality=${event.Killer.Equipment.MainHand.Quality}"/>`;
      eventHTML += `<td id="${event.EventId}" eventIndex="${i}" type="killer" style="color: #29e09d;">${killerMainHand}${event.Killer.Name}<span class="tooltiptext">$</span></td>`;
      eventHTML += `<td>KILLED</td>`;

      let victimMainHand = (event.Victim.Equipment.MainHand?.Type === undefined) ? '' : `<img src="https://render.albiononline.com/v1/item/${event.Victim.Equipment.MainHand.Type}.png?size=50&quality=${event.Victim.Equipment.MainHand.Quality}"/>`;
      eventHTML += `<td id="${event.EventId}" eventIndex="${i}" type="victim" style="color: #e02983;">${victimMainHand}${event.Victim.Name}<span class="tooltiptext">$</span></td>`;
      return eventHTML + '</tr>';
    });
    allEventsHTML = $(`<table id="${battleID}" cellpadding="5" cellspacing="0" border="0" style="padding-left:50px;">${allEventsHTML.join('')}</table>`);

    // Hide tooltip initially, setup tooltip styles
    $(allEventsHTML[0]).find('td .tooltiptext').css({
      'visibility': 'hidden',
      'width': 'auto',
      'background-color': '#1a1d24',
      'color': '#fff',
      'padding': '10px',
      'border-radius': '6px',
      'position': 'absolute',
      'z-index': '1'
    });

    // Bind events when hovering over player names
    currentBattle.playerEvents.map(event => event.EventId).forEach(eventID => {
      $(allEventsHTML).find(`td#${eventID}`).unbind('hover').hover(e => {
        let eventID = e.target.getAttribute('id')
        let targetType = e.target.getAttribute('type');
        let eventIndex = parseInt(e.target.getAttribute('eventIndex'));
        let queryKey = (targetType === 'killer') ? 'Killer' : 'Victim';

        // Populate tooltip
        // Player info, item power
        let tooltipHTML = '';
        let target = attendedBattles[battleID].playerEvents[eventIndex][queryKey];
        tooltipHTML += `<h4>${target.Name} [${target.AverageItemPower.toFixed(0)} IP]</h4>`;
        if (target.GuildName !== null) {
          tooltipHTML += `<h6>${target.GuildName}</h6>`;
        }

        // Player equipment
        tooltipHTML += `<h7>Equipment</h7><br/>`;
        let equipment = attendedBattles[battleID].playerEvents[eventIndex][queryKey].Equipment;
        let renderItems = [];
        renderItems.push([equipment.MainHand?.Type, equipment.MainHand?.Quality, equipment.MainHand?.Count]);
        renderItems.push([equipment.OffHand?.Type, equipment.OffHand?.Quality, equipment.OffHand?.Count]);
        renderItems.push([equipment.Head?.Type, equipment.Head?.Quality, equipment.Head?.Count]);
        renderItems.push([equipment.Armor?.Type, equipment.Armor?.Quality, equipment.Armor?.Count]);
        renderItems.push([equipment.Cape?.Type, equipment.Cape?.Quality, equipment.Cape?.Count]);
        renderItems.push([equipment.Shoes?.Type, equipment.Shoes?.Quality, equipment.Shoes?.Count]);
        renderItems.push([equipment.Food?.Type, equipment.Food?.Quality, equipment.Food?.Count]);
        renderItems.push([equipment.Potion?.Type, equipment.Potion?.Quality, equipment.Potion?.Count]);
        renderItems.push([equipment.Mount?.Type, equipment.Mount?.Quality, equipment.Mount?.Count]);
        renderItems.forEach(item => {
          if (item[0] !== undefined) {
            let itemCode = item[0]
            let itemQuality = item[1];
            let itemCount = item[3];
            tooltipHTML += `<img src="https://render.albiononline.com/v1/item/${itemCode}.png?size=50&quality=${itemQuality}"/>`;
          }
        })

        // Victim bag content
        if (targetType === 'victim') {
          if (target.Inventory.filter(x => x !== null).length > 0) {
            tooltipHTML += `<br/><h7>Bag</h7><br/>`;
          }
          target.Inventory.filter(x => x !== null).forEach((item, i) => {
            if (i % 9 == 0 && i != 0) {
              tooltipHTML += '<br/>';
            }
            console.log(item);
            tooltipHTML += `<img src="https://render.albiononline.com/v1/item/${item.Type}.png?size=50&quality=${item.Quality}"/>`;
            if (item.Count > 1) {
              tooltipHTML += `<span>x${item.Count}</span>`;
            }
          });
        }

        // Show tooltip
        $('table').find(`td#${eventID}[type=${targetType}] .tooltiptext`).html(tooltipHTML);
        $('table').find(`td#${eventID}[type=${targetType}] .tooltiptext`).css('visibility', 'visible');
      }, (e) => {
        $('table').find(`td#${eventID} .tooltiptext`).css('visibility', 'hidden');
      });
    });

    return allEventsHTML;
  }

  // Initialize data table
  if ($.fn.DataTable.isDataTable('#battleTable')) {
    $('#battleTable').DataTable().clear().destroy();
  }
  let table = $('#battleTable').DataTable({
    data: battleSummary,
    columns: [
      {
        className: 'dt-control',
        orderable: false,
        data: null,
        defaultContent: '',
      },
      {
        title: 'ID',
        render: function(data, type, row, meta) {
          if(type === 'display'){
            data = `<a href="https://albionbattles.com/battles/${data}" target="_blank">${data}</a>`;
          }
          return data;
        }
      },
      {
        title: 'Start Time',
        render: (data, type, row, meta) => {return data.toUTCString()}
      },
      { title: 'Player Kill Fame',
        render: (data, type, row, meta) => {
          return `<span style="color: #29e09d">${data.toLocaleString("en-US")}</span>`;
        }
      },
      { title: 'Player Death Fame',
        render: (data, type, row, meta) => {
          return `<span style="color: #e02983">${data.toLocaleString("en-US")}</span>`;
        }
      },
      { title: 'Player Kills',
        render: (data, type, row, meta) => {
          return `<span style="color: #29e09d">${data.toLocaleString("en-US")}</span>`;
        }
      },
      { title: 'Player Deaths',
        render: (data, type, row, meta) => {
          return `<span style="color: #e02983">${data.toLocaleString("en-US")}</span>`;
        }
      },
    ]
  });

  // Add event listener for opening and closing details
  $('#battleTable tbody').unbind('click').on('click', 'td.dt-control', function() {
    var tr = $(this).closest('tr');
    var row = table.row(tr);

    if (row.child.isShown()) {
      // This row is already open - close it
      row.child.hide();
    } else {
      // Open this row
      if (row.child.length > 0) {
        row.child.show();
      } else {
        row.child(format(row.data())).show();
      }
    }
  });

  // Unblock UI once done
  $.unblockUI();
}
