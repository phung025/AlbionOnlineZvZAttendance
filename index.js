const { ipcRenderer } = require('electron');
const axios = require('axios');
const echarts = require('echarts');
const moment = require('moment');
console.log("Loading index.js");

const ALBION_API_URL = 'https://gameinfo.albiononline.com/api/gameinfo';

const DIV_SEARCH_INPUT = 'input#searchID';
const DIV_GROUP_TYPE = 'select#groupType';
const DIV_MESSAGE_MODAL = '#messageModal';
const DIV_FROM_DATE_PICKER = 'input#fromDate';
const DIV_TO_DATE_PICKER = 'input#toDate';
const DIV_PLAYE_COUNT_INPUT = 'input#players';

$('#donation').textMarquee({
  mode: 'loop'
});

$('button#search').unbind('click').click(() => {
  console.log("Searching...");

  // Get and validate guild/allliance id
  let searchID = $(DIV_SEARCH_INPUT).val().trim();
  if (searchID.length == 0) {
    displayMessage('Guild/Alliance ID cannot be empty!');
    return;
  }

  // Get group type
  let groupType = $(DIV_GROUP_TYPE).val();

  // Get and validate dates
  let from = $(DIV_FROM_DATE_PICKER);
  let to = $(DIV_TO_DATE_PICKER);
  if (from.val() == '' || to.val() == '') {
    displayMessage('Must select search range!');
  }
  let fromDateVal = new Date(moment(from.val(), 'YYYY-MM-DD')).setHours(0,0,0,0);
  let toDateVal = new Date(moment(to.val(), 'YYYY-MM-DD')).setHours(23,59,59,999);
  if (fromDateVal > toDateVal) {
    displayMessage('From date must not occur after to date');
    return;
  }

  // Get minimum players count
  let playerCount = $(DIV_PLAYE_COUNT_INPUT).val();
  if (playerCount == '') {
    displayMessage('Must provide minimum number of players in a battle');
    return;
  }

  // Query to find all battles
  getBattles(searchID, groupType, fromDateVal, toDateVal, playerCount).then(battles => {
    // Initialize the data table and analysis for all battles of the query group
    initBattleSummary(battles, searchID, groupType);

    // Get member list of guild / alliance and process statistics data
    // ID, Name, Guild, Alliance, AttendanceCount, AttendanceRate, KillFame, Kills, Deaths, KDRatio
    initZvZAttendanceTable(searchID, groupType, battles).then(allMembers => {
      initZvZAttendanceChart(searchID, groupType, allMembers);
    });
  });
});

// Init the table contain all battles summary of the query group
// and the attendance overview chart
function initBattleSummary(battles, searchID, groupType) {
  let queryKey = (groupType == 'guild') ? 'guildId' : 'allianceId';
  let battleSummary = battles.map(battle => {
    // Count number of players from the queried guild / alliance and battle duration
    let playerCount = Object.keys(battle.players).map(playerID => (battle.players[playerID][queryKey] === searchID) ? 1 : 0).reduce((partialSum, a) => partialSum + a, 0);
    let diff = Math.abs(new Date(battle.endTime) - new Date(battle.startTime));

    return [battle.id, new Date(battle.startTime), `${Math.ceil((diff / 1000) / 60)} minutes`, playerCount];
  });
  if ($.fn.DataTable.isDataTable('#battleTable')) {
    $('#battleTable').DataTable().clear().destroy();
  }
  $('#battleTable').DataTable({
    dom: 'lBfrtip',
    data: battleSummary,
    columns: [
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
      { title: 'Duration' },
      { title: 'Players Attended' },
    ],
    order: [[3, 'desc']],
    buttons: ['excel']
  });

  // Init the chart that summarizes the zvz attendance count from the battle table
  initBattleChart(battleSummary);
}

function initBattleChart(summary) {
  summary.sort(function(a, b){
    return a[1] - b[1]; // Sort by date oldest to newest
  });
  let chart = echarts.init($('#battleChart')[0]);
  let option = {
    xAxis: {
      type: 'category',
      data: summary.map(x => x[1].toDateString()),
      axisLabel: {
        color: 'white'
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: 'white'
      }
    },
    series: [
      {
        data: summary.map(x => x[3]),
        type: 'line',
        lineStyle: {
          color: '#ec552c'
        },
        itemStyle: {
          color: '#ec552c'
        },
        areaStyle: {
          color: '#1a1d24'
        }
      }
    ],
    title: {
      text: 'ZvZ Battle Attendance by Time',
      textStyle: {
        color: 'white'
      }
    }
  };
  option && chart.setOption(option);
}

function initZvZAttendanceChart(searchID, groupType, allMembers) {
  // EChart options
  let options = {};

  // Generate chart according to search type
  if (groupType === 'guild') {
    const attendanceCount = {
      '+90%': 0,
      '75% -> 90%': 0,
      '50% -> 75%': 0,
      '20% -> 50%': 0,
      '+0% -> 20%': 0,
      '0%': 0
    };

    let guildName = '';
    Object.keys(allMembers).forEach((memberID, i) => {
      // Get guild info
      guildName = allMembers[memberID][2];

      // Generate data for pie chart
      let attendanceRatio = allMembers[memberID][5];
      if (attendanceRatio >= 0.9) {
        ++attendanceCount['+90%'];
      } else if (0.75 <= attendanceRatio && attendanceRatio < 0.9) {
        ++attendanceCount['75% -> 90%'];
      } else if (0.5 <= attendanceRatio && attendanceRatio < 0.75) {
        ++attendanceCount['50% -> 75%'];
      } else if (0.2 <= attendanceRatio && attendanceRatio < 0.5) {
        ++attendanceCount['20% -> 50%'];
      } else if (0 < attendanceRatio < 0.2) {
        ++attendanceCount['+0% -> 20%'];
      } else {
        ++attendanceCount['0%'];
      }
    });

    // Init pie chart options
    option = {
      tooltip: {
        trigger: 'item'
      },
      legend: {
        top: '5%',
        left: 'center',
        textStyle: {
          color: 'white'
        }
      },
      title: {
        text: `Attendance Ratio of ${guildName} Members`,
        textStyle: {
          color: 'white'
        }
      },
      series: [
        {
          name: `Members with Attendance Ratio`,
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 40,
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data: Object.keys(attendanceCount).map(k => {return {name: k, value: attendanceCount[k]}})
        }
      ]
    };


  } else {
    // Get all guilds in alliance
    const attendanceCount = {
      '+90%': {},
      '75% -> 90%': {},
      '50% -> 75%': {},
      '20% -> 50%': {},
      '+0% -> 20%': {},
      '0%': {}
    }
    const allGuilds = Array.from(new Set(Object.keys(allMembers).map(k => allMembers[k][2])));
    allGuilds.sort();
    Object.keys(attendanceCount).forEach(k => {
      allGuilds.forEach(guildName => {
        attendanceCount[k][guildName] = 0;
      });
    });

    let allianceTag = '';
    Object.keys(allMembers).forEach((memberID, i) => {
      // Generate data for pie chart
      let attendanceRatio = allMembers[memberID][5];
      let guildName = allMembers[memberID][2];
      allianceTag = allMembers[memberID][3];

      if (attendanceRatio >= 0.9) {
        ++attendanceCount['+90%'][guildName];
      } else if (0.75 <= attendanceRatio && attendanceRatio < 0.9) {
        ++attendanceCount['75% -> 90%'][guildName];
      } else if (0.5 <= attendanceRatio && attendanceRatio < 0.75) {
        ++attendanceCount['50% -> 75%'][guildName];
      } else if (0.2 <= attendanceRatio && attendanceRatio < 0.5) {
        ++attendanceCount['20% -> 50%'][guildName];
      } else if (0 < attendanceRatio < 0.2) {
        ++attendanceCount['+0% -> 20%'][guildName];
      } else {
        ++attendanceCount['0%'][guildName];
      }
    });

    option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        textStyle: {
          color: 'white'
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        axisLabel: {
          color: 'white'
        }
      },
      yAxis: {
        type: 'category',
        axisLabel: {
          color: 'white'
        },
        data: allGuilds
      },
      title: {
        text: `Attendance Ratio of ${allianceTag} Members`,
        textStyle: {
          color: 'white'
        }
      },
      series: Object.keys(attendanceCount).map(k => {return {
        name: k,
        type: 'bar',
        stack: 'total',
        label: {
          show: true
        },
        emphasis: {
          focus: 'series'
        },
        data: allGuilds.map(guildName => attendanceCount[k][guildName])
      }})
    };
  }

  // Init chart
  echarts.dispose($('#attendanceChart')[0]);
  attendanceChart = echarts.init($('#attendanceChart')[0], null, {
    renderer: 'svg'
  });
  option && attendanceChart.setOption(option);
}

// Initialize the summary of zvz attendance for each member of the group
// Function takes in groupID, groupType to retrieve list of members of the group
// and use the list of battles to generate zvz statistics
async function initZvZAttendanceTable(searchID, groupType, battles) {
  $.blockUI({ message: '<div class="spinner-border" role="status"></div> Searching for Battles...' });
  return getMembers(searchID, groupType).then(allMembers => {
    // Process statistics
    battles.forEach(battle => {
      Object.keys(battle.players).forEach(playerID => {
        if (playerID in allMembers) {
          allMembers[playerID][4] += 1; // ZvZ attendance count
          allMembers[playerID][5] = allMembers[playerID][4] / battles.length; // Attendance ratio
          allMembers[playerID][6] += isNaN(battle.players[playerID].KillFame) ? 0 : battle.players[playerID].KillFame; // Kill fame
          allMembers[playerID][7] += battle.players[playerID].kills; // Kill count in current battle
          allMembers[playerID][8] += battle.players[playerID].deaths; // Death count
          allMembers[playerID][9] = allMembers[playerID][7] / ((allMembers[playerID][8] == 0) ? 1 : allMembers[playerID][8]); // K/D ratio
        }
      });
    });

    // Generate table
    if ($.fn.DataTable.isDataTable('#attendanceTable')) {
      $('#attendanceTable').DataTable().clear().destroy();
    }
    let table = $('#attendanceTable').DataTable({
      dom: 'lBfrtip',
      data: Object.values(allMembers),
      columns: [
        { title: 'ID',
        render: function(data, type, row, meta) {
          if(type === 'display'){
            data = `<a href="https://albiononline.com/en/killboard/player/${data}" target="_blank">${data}</a>`;
          }
          return data;
        }
      },
      { title: 'Name' },
      { title: 'Guild' },
      { title: 'Alliance Tag' },
      { title: 'Attendance Count' },
      { title: 'Attendance Ratio',
      render: (data, type, row, meta) => `${(data * 100).toFixed(2)}%`
    },
    { title: 'Kill Fame' },
    { title: 'Total Kills' },
    { title: 'Total Deaths' },
    { title: 'K/D Ratio',
    render: (data, type, row, meta) => data.toFixed(2)
  },
],
order: [[4, 'desc']],
buttons: ['excel']
});
$('#attendanceTable tbody').unbind('click').on('click', 'tr', function () {
  let data = table.row(this).data();
  ipcRenderer.invoke('show-player-detail', JSON.stringify({player: data, battles: battles}));
});

//Return statistic data of all members in the group
return allMembers;
}).finally(allMembers => {

  // Unblock UI and return function result
  $.unblockUI();
  return allMembers;
});
}

// Get object of members from the query guild/alliance id
// Return an array contains player ID, Name, Guild, Alliance, AttendanceCount, AttendanceRate, KillFame, Kills, Deaths, KDRatio
// All the values after Alliance are set to be 0
async function getMembers(groupID, groupType) {
  // Get list of all guilds
  let allianceTag = ''; // Alliance tag has to be retrieved separately because for some reasons, the alliance tag and alliance name of the player are sometimes mixed or not existed at all
  let guilds = [];
  if (groupType === 'guild') {
    guilds.push(groupID);
    await axios.get(ALBION_API_URL + `/guilds/${groupID}`).then(response => {
      if (response.status == 200) {
        allianceTag = response.data.AllianceTag;
      }
    }).catch(error => {
      console.log('Error while fetching alliance tag:', error);
    });
  } else {
    guilds = guilds.concat(await axios.get(ALBION_API_URL + `/alliances/${groupID}`).then(response => {
      if (response.status == 200) {
        allianceTag = response.data.AllianceTag;
        return response.data.Guilds.map(guild => guild.Id);
      }
      return [];
    }).catch(error => {
      console.log('Error while fetching guilds in the alliance:', error);
      return [];
    }));
  }

  // Generate list of all members as a json object from list of querying guilds
  let members = {};
  for (i = 0; i < guilds.length; ++i) {
    await axios.get(ALBION_API_URL + `/guilds/${guilds[i]}/members`).then(response => {
      if (response.status == 200) {
        response.data.forEach(p => {
          members[p.Id] = [p.Id, p.Name, p.GuildName, allianceTag, 0, 0, 0, 0, 0, 0];
        });
      }
    }).catch(error => {
      console.log('Error while fetching guild members:', error);
    });
  }

  return members;
}

async function getBattles(groupID, groupType, from, to, minPlayers) {
  let queryKey = (groupType == 'guild') ? 'guildId' : 'allianceId';
  let limit = 51;
  let isSearchDone = false;
  let selectedBattles = [];

  async function getBattlesHelper(groupID, groupType, from, to, minPlayers, offset) {
    return axios.get(ALBION_API_URL + `/battles?offset=${offset}&limit=${limit}&sort=recent&${queryKey}=${groupID}`).then(response => {
      // handle success
      if (response.status == 200) {
        response.data.every(battle => {
          let battleID = battle.id;
          let startTime = new Date(battle.startTime).setHours(0,0,0,0);

          // Check if battle in date range and has minimum players required
          if ((from <= startTime) && (startTime <= to) && Object.keys(battle.players).length > minPlayers) {
            let groupPlayerCount = 0;
            Object.keys(battle.players).forEach(playerID => {
              if (battle.players[playerID][queryKey] === groupID) {
                ++groupPlayerCount;
              }
            });

            // The battle satisfy the minimum players in the group and occurred between the selected date
            if (groupPlayerCount >= minPlayers) {
              selectedBattles.push(battle);
            }
          }

          // Early stop if battle start time out of range, false value will stop the function
          return (startTime >= from);
        });

        // Determine if the search is done or not
        if (new Date(response.data[response.data.length - 1].startTime).setHours(0,0,0,0) >= from) {
          isSearchDone = false;
        } else {
          isSearchDone = true;
        }
      }
    }).catch(error => {
      console.log("Error while fetching battles:", error);
      isSearchDone = true;
    });
  }

  // Iterative querying battles until done
  $.blockUI({ message: '<div class="spinner-border" role="status"></div> Searching for Battles...' });
  let offset = 0;
  while (!isSearchDone) {
    await getBattlesHelper(groupID, groupType, from, to, minPlayers, offset);
    offset += limit;

    // SBI API only allow up to offset + limit <= 10000 and will return error if it exceed this limit
    if (offset + limit > 10000) {
      break;
    }
  }
  console.log('Found', selectedBattles.length, 'battles');
  $.unblockUI();

  return selectedBattles;
}

// Display the modal with input message
function displayMessage(msg) {
  $(DIV_MESSAGE_MODAL).modal({
    escapeClose: false,
    clickClose: false,
    showClose: false,
  });
  $(`${DIV_MESSAGE_MODAL} p#content`).text(msg);
}
