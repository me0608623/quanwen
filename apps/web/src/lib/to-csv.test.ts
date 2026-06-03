import { describe, expect, it } from 'vitest';
import { toCsv } from './to-csv';
describe('toCsv', () => {
  it('含 BOM 與標頭', () => {
    const csv = toCsv([['a', 'b'], ['1', '2']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"a","b"');
    expect(csv).toContain('"1","2"');
  });
  it('跳脫雙引號', () => {
    expect(toCsv([['他說"嗨"']])).toContain('"他說""嗨"""');
  });
  it('含逗號的儲存格不會破壞欄位（整格加引號）', () => {
    const csv = toCsv([['台北, 台灣', 'x']]);
    expect(csv).toContain('"台北, 台灣","x"');
  });
  it('含換行的儲存格保留在引號內', () => {
    const csv = toCsv([['第一行\n第二行']]);
    expect(csv).toContain('"第一行\n第二行"');
  });
  it('空字串儲存格輸出為空引號', () => {
    expect(toCsv([['', 'b']])).toContain('"","b"');
  });
  it('以換行分隔資料列', () => {
    const csv = toCsv([['a'], ['b']]);
    expect(csv).toBe('﻿"a"\n"b"');
  });
});
