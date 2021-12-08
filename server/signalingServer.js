const app = require('express')();
const request = require('request');
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  path: '/signaling/socket.io',
});

const postUserStatistics = (userId, studyTime, today) => {
  let options = {
    uri: `http://118.67.133.19:8080/statistics`,
    method: 'POST',
    body: {
      userId: userId,
      studyTime: studyTime,
      date: today,
    },
    json: true,
  };
  request.post(options, (error, response, body) => {
    if (error) console.log(error);
  });
};

const getStudyRoomOut = (studyroom_id) => {
  request.get(
    { uri: `http://118.67.133.19:8080/studyrooms/${studyroom_id}/out` },
    (error, response, body) => {
      if (error) console.log(error);
    },
  );
};

const getTime = (seconds) => {
  var hour =
    parseInt(seconds / 3600) < 10
      ? '0' + parseInt(seconds / 3600)
      : parseInt(seconds / 3600);
  var min =
    parseInt((seconds % 3600) / 60) < 10
      ? '0' + parseInt((seconds % 3600) / 60)
      : parseInt((seconds % 3600) / 60);
  var sec = seconds % 60 < 10 ? '0' + (seconds % 60) : seconds % 60;
  return hour + ':' + min + ':' + sec;
};

const leftPad = (value) => {
  if (value >= 10) {
    return value;
  }
  return `0${value}`;
};

const toStringByFormatting = (source, delimiter = '-') => {
  const year = source.getFullYear();
  const month = leftPad(source.getMonth() + 1);
  const day = leftPad(source.getDate());
  return [year, month, day].join(delimiter);
};

let users = new Map();
let socketToRoom = new Map();
const maximum = 8;

io.on('connection', (socket) => {
  socket.on('join_room', (data) => {
    if (users[data.room]) {
      const length = users[data.room].length;
      if (length === maximum) {
        socket.to(socket.id).emit('room_full');
        return;
      }
      users[data.room].push({
        socketId: socket.id,
        userName: data.userName,
        userId: data.userId,
        studyStart: 0,
      });
    } else {
      users[data.room] = [
        {
          socketId: socket.id,
          userName: data.userName,
          userId: data.userId,
          studyStart: 0,
        },
      ];
    }
    socketToRoom[socket.id] = data.room;
    socket.join(data.room);
  });

  socket.on('users_in_room', (data) => {
    const usersInThisRoom = users[data.room].filter(
      (user) => user.socketId !== socket.id,
    );

    users[data.room].map((user) => {
      if (user.socketId === socket.id) user['studyStart'] = Date.now() / 1000;
    });

    io.sockets.to(socket.id).emit('all_users', usersInThisRoom);
  });

  socket.on('offer', (data) => {
    socket.to(data.offerReceiveID).emit('getOffer', {
      sdp: data.sdp,
      offerSendID: data.offerSendID,
      offerSendUserName: data.offerSendUserName,
      offerSendUserId: data.offerSendUserId,
      offerStudyTimer: data.offerStudyTimer,
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.answerReceiveID).emit('getAnswer', {
      sdp: data.sdp,
      answerSendID: data.answerSendID,
      answerStudyTimer: data.answerStudyTimer,
    });
  });

  socket.on('candidate', (data) => {
    socket.to(data.candidateReceiveID).emit('getCandidate', {
      candidate: data.candidate,
      candidateSendID: data.candidateSendID,
    });
  });

  socket.on('chatting', (data) => {
    const room = socketToRoom[data.messageSendID];
    users[room].map((user) => {
      socket.to(user.socketId).emit('chatting', data);
    });
  });

  socket.on('kickOut', (data) => {
    const room = socketToRoom[data.socketId];
    users[room].map((user) => {
      if (data.socketId === user.socketId) socket.to(user.socketId).emit('kickOut');
    });
  });

  socket.on('disconnect', () => {
    const roomID = socketToRoom[socket.id];
    let room = users[roomID];
    if (room) {
      const disconnectedUserInfo = room.filter((user) => user.socketId === socket.id);
      if (disconnectedUserInfo[0].studyStart !== 0) {
        const studyTime = getTime(
          Math.floor(Date.now() / 1000 - disconnectedUserInfo[0].studyStart),
        );
        let today = toStringByFormatting(new Date());
        postUserStatistics(disconnectedUserInfo[0].userId, studyTime, today);
      }

      getStudyRoomOut(roomID);
      room = room.filter((user) => user.socketId !== socket.id);
      users[roomID] = room;
      if (room.length === 0) {
        delete users[roomID];
        return;
      }
    }
    socket.to(roomID).emit('user_exit', { socketId: socket.id });
  });
});

server.listen(3001, function () {
  console.log('Listening on http://localhost:3001/');
});
