require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5001;

// 포트 정리 함수 (로컬 개발 환경에서만 사용, Heroku에서는 비활성화)
function killPort(port) {
  // Heroku 환경에서는 실행하지 않음
  if (process.env.NODE_ENV === 'production' || process.env.DYNO) {
    return Promise.resolve();
  }
  
  return new Promise((resolve) => {
    exec(`lsof -ti:${port}`, (error, stdout) => {
      if (stdout && stdout.trim()) {
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
// Heroku에서는 MONGODB_URI 또는 MONGO_URI 환경 변수 사용
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/vibe-steel';

// MongoDB 연결 옵션
const mongooseOptions = {
  serverSelectionTimeoutMS: 10000, // 10초 타임아웃 (Heroku에서 더 긴 시간 필요)
  socketTimeoutMS: 45000,
  connectTimeoutMS: 15000, // 15초 연결 타임아웃
  retryWrites: true,
  retryReads: true,
  maxPoolSize: 10, // 연결 풀 크기
  minPoolSize: 1,
};

// MongoDB 연결 상태 및 에러 정보 저장
let mongoConnectionError = null;
let mongoConnectionAttempted = false;

// MongoDB 연결 함수
async function connectMongoDB() {
  try {
    mongoConnectionAttempted = true;
    mongoConnectionError = null;
    
    if (!MONGODB_URI || MONGODB_URI === 'mongodb://localhost:27017/vibe-steel') {
      const errorMsg = 'MongoDB URI가 설정되지 않았습니다. 환경 변수 MONGODB_URI 또는 MONGO_URI를 설정해주세요.';
      console.warn('⚠️  ' + errorMsg);
      console.warn('⚠️  Heroku에서는 MongoDB Atlas나 mLab 같은 클라우드 MongoDB 서비스를 사용해야 합니다.');
      mongoConnectionError = errorMsg;
      return false;
    }

    // 기존 연결이 있으면 먼저 닫기
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }

    await mongoose.connect(MONGODB_URI, mongooseOptions);
    console.log('✅ MongoDB 연결 성공!');
    const maskedUri = MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log(`📦 데이터베이스: ${maskedUri}`);
    
    // 연결 이벤트 리스너
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB 연결 에러:', err.message);
      mongoConnectionError = err.message;
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB 연결이 끊어졌습니다.');
      mongoConnectionError = '연결이 끊어졌습니다.';
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB 재연결 성공!');
      mongoConnectionError = null;
    });
    
    return true;
  } catch (error) {
    const errorDetails = {
      message: error.message,
      name: error.name,
      code: error.code || 'UNKNOWN',
      codeName: error.codeName || null
    };
    
    mongoConnectionError = errorDetails;
    
    console.error('❌ MongoDB 연결 실패:', error.message);
    console.error('   에러 코드:', error.code || 'N/A');
    console.error('   에러 이름:', error.name || 'N/A');
    
    // 구체적인 에러 메시지 제공
    if (error.message.includes('authentication failed')) {
      console.error('💡 인증 실패: 사용자 이름 또는 비밀번호가 잘못되었습니다.');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.error('💡 DNS 조회 실패: MongoDB 호스트 주소를 확인해주세요.');
    } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
      console.error('💡 연결 타임아웃: 네트워크 연결 또는 IP 화이트리스트를 확인해주세요.');
    } else if (error.message.includes('IP')) {
      console.error('💡 IP 접근 거부: MongoDB Atlas IP 화이트리스트에 Heroku IP를 추가해주세요.');
    }
    
    console.error('💡 확인 사항:');
    console.error('   1. MONGODB_URI 또는 MONGO_URI 환경 변수가 올바르게 설정되었는지 확인');
    console.error('   2. MongoDB 서버가 실행 중인지 확인');
    console.error('   3. 네트워크 연결 및 방화벽 설정 확인');
    console.error('   4. MongoDB Atlas를 사용하는 경우 IP 화이트리스트에 0.0.0.0/0 추가 (모든 IP 허용)');
    console.error('   5. Heroku 로그 확인: heroku logs --tail');
    
    return false;
  }
}

// CORS 및 JSON 파싱 미들웨어
const cors = require('cors');
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우터 import
const materialsRouter = require('./routers/materials');

// 기본 라우트
app.get('/', (req, res) => {
  const readyState = mongoose.connection.readyState;
  let status = 'disconnected';
  let statusText = '연결 안 됨';
  
  // Mongoose readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  switch(readyState) {
    case 0:
      status = 'disconnected';
      statusText = '연결 안 됨';
      break;
    case 1:
      status = 'connected';
      statusText = '연결됨';
      break;
    case 2:
      status = 'connecting';
      statusText = '연결 중...';
      break;
    case 3:
      status = 'disconnecting';
      statusText = '연결 해제 중...';
      break;
  }
  
  const response = { 
    message: 'Vibe Steel System is running!',
    mongodb: {
      status: status,
      statusText: statusText,
      readyState: readyState,
      uri: MONGODB_URI && MONGODB_URI !== 'mongodb://localhost:27017/vibe-steel' 
        ? '설정됨' 
        : '설정 안 됨 (환경 변수 확인 필요)',
      connectionAttempted: mongoConnectionAttempted
    }
  };
  
  // 연결 실패 시 에러 정보 추가
  if (mongoConnectionError && readyState === 0) {
    response.mongodb.error = {
      message: typeof mongoConnectionError === 'string' 
        ? mongoConnectionError 
        : mongoConnectionError.message,
      code: typeof mongoConnectionError === 'object' ? mongoConnectionError.code : null,
      name: typeof mongoConnectionError === 'object' ? mongoConnectionError.name : null,
      troubleshooting: [
        '1. Heroku 환경 변수 확인: heroku config:get MONGODB_URI',
        '2. MongoDB Atlas IP 화이트리스트에 0.0.0.0/0 추가 (모든 IP 허용)',
        '3. 연결 문자열 형식 확인: mongodb+srv://username:password@cluster.mongodb.net/dbname',
        '4. Heroku 로그 확인: heroku logs --tail',
        '5. MongoDB Atlas 클러스터가 실행 중인지 확인'
      ]
    };
  }
  
  res.json(response);
});

// API 라우터 등록
app.use('/api/materials', materialsRouter);

// 서버 시작 함수
async function startServer() {
  try {
    // Node.js/npm 프로세스 자동 정리 (로컬 환경에서만)
    await killPort(PORT);
    
    // MongoDB 연결 시도
    const mongoConnected = await connectMongoDB();
    
    if (!mongoConnected) {
      console.warn('⚠️  MongoDB 연결 실패했지만 서버는 계속 실행됩니다.');
      console.warn('⚠️  API 엔드포인트는 작동하지 않을 수 있습니다.');
    }
    
    const server = app.listen(PORT, () => {
      console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
      console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
      if (process.env.DYNO) {
        console.log(`☁️  Heroku Dyno: ${process.env.DYNO}`);
      }
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
  } catch (error) {
    console.error('❌ 서버 시작 중 오류 발생:', error.message);
    process.exit(1);
  }
}

startServer();
