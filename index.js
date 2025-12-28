require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5001;

// 포트 정리 함수 (Node.js/npm 프로세스만 정리)
function killPort(port) {
  return new Promise((resolve) => {
    exec(`lsof -ti:${port}`, (error, stdout) => {
      if (stdout.trim()) {
        const pids = stdout.trim().split('\n');
        let killedCount = 0;
        
        pids.forEach(pid => {
          // 프로세스가 node/npm 관련인지 확인
          exec(`ps -p ${pid} -o command=`, (err, cmd) => {
            if (!err && cmd && (cmd.includes('node') || cmd.includes('npm'))) {
              exec(`kill -9 ${pid}`, () => {
                killedCount++;
                console.log(`🔧 Node.js 프로세스 (PID: ${pid}) 종료 완료`);
              });
            }
          });
        });
        
        // 약간의 지연 후 결과 확인
        setTimeout(() => {
          if (killedCount > 0) {
            console.log(`✅ 포트 ${port}를 사용하던 Node.js 프로세스 ${killedCount}개를 정리했습니다.`);
          }
          resolve();
        }, 500);
      } else {
        resolve();
      }
    });
  });
}

// MongoDB 연결 설정
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vibe-steel';

// MongoDB 연결
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB 연결 성공!');
    console.log(`📦 데이터베이스: ${MONGODB_URI}`);
  })
  .catch((error) => {
    console.error('❌ MongoDB 연결 실패:', error.message);
    process.exit(1);
  });

// CORS 및 JSON 파싱 미들웨어
const cors = require('cors');
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우터 import
const materialsRouter = require('./routers/materials');

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ 
    message: 'Vibe Steel System is running!',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// API 라우터 등록
app.use('/api/materials', materialsRouter);

// 서버 시작 함수
async function startServer() {
  // Node.js/npm 프로세스 자동 정리
  await killPort(PORT);
  
  const server = app.listen(PORT, () => {
    console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
  });

  // 포트 충돌 에러 핸들링
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ 포트 ${PORT}가 이미 사용 중입니다.`);
      console.log(`💡 해결 방법:`);
      console.log(`   1. 수동 종료: lsof -ti:${PORT} | xargs kill -9`);
      console.log(`   2. 또는 코드에서 killPort 함수의 주석을 해제하여 자동 정리 사용`);
      process.exit(1);
    } else {
      console.error('❌ 서버 시작 실패:', error.message);
      process.exit(1);
    }
  });
}

startServer();
