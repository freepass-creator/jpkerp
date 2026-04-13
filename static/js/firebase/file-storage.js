/**
 * file-storage.js — Firebase Storage 파일 업로드/다운로드
 */
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';
import { storage } from './config.js';

/**
 * 파일 업로드
 * @param {File} file
 * @param {string} path — 예: 'penalties/2026-04-13/161호1063_고지서.pdf'
 * @returns {Promise<string>} 다운로드 URL
 */
export async function uploadFile(file, path) {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

/**
 * 과태료 고지서 원본 업로드
 * @param {File} file — 스캔 파일
 * @param {string} carNumber — 차량번호
 * @param {string} date — 위반일 (YYYY-MM-DD)
 * @returns {Promise<string>} 다운로드 URL
 */
export async function uploadPenaltyFile(file, carNumber, date) {
  const ext = file.name.split('.').pop().toLowerCase();
  const safeDate = (date || new Date().toISOString().split('T')[0]).replace(/\//g, '-');
  const path = `penalties/${safeDate}/${carNumber}_고지서.${ext}`;
  return uploadFile(file, path);
}
