/**
 * firebase/config.js — Firebase 초기화
 * jpkerp와 동일한 프로젝트 사용 — 데이터 그대로 읽기
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCCzPhqUiLXFB0zu41txT9OjKXE8ACqu4Y',
  authDomain: 'jpkerp.firebaseapp.com',
  databaseURL: 'https://jpkerp-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'jpkerp',
  storageBucket: 'jpkerp.firebasestorage.app',
  messagingSenderId: '395022136514',
  appId: '1:395022136514:web:b5c8b41be53a263daf375b',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
