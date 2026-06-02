QUA-270 Schema review, migration cleanup and DB performance notes

結論先講：這個 schema 沒有什麼「把它炸掉」等級的爛尾，但有幾個熱路徑明顯欠調校。

1. Schema review
- apps/api/src/db/schema/ 目前 16 個 schema 檔案都有被對應 service / controller / seed / test 使用，沒有發現可直接刪掉的死表定義。
- ECPay 相關欄位與流程仍在 wallet service / web hooks 使用中，不是遺跡，別手癢亂砍。
- 外鍵命名大致一致，主鍵一律 uuid，onDelete 策略也算合理：
  - survey/responses/question answers 多數用 cascade，符合主資料刪除時清理子資料的需求
  - mutual pair 的 response FK 用 set null，避免配對歷史被硬刪爆
- response_answers.survey_id 的反正規化是合理的，不是髒資料；它直接服務統計/匯出查詢。

2. Migration cleanup review
- drizzle 目錄中有一批手寫 SQL migration，屬於「專案演進很快時的務實產物」，不是漂亮，但可用。
- manual_add_points_and_reward_type.sql 是 legacy manual migration，仍有價值，因為 schema 的 reward_type 目前仍存在且被 surveys / wallet 流程使用。
- 這次沒有硬做 migration collapse。原因很簡單：現在缺少一份正式 migration ledger / snapshot 對照，亂合併只會把 fresh setup 變成踩地雷比賽。
- 建議後續若要真的整理 migration，做法應該是：
  1) 先在空 DB 全量重播驗證
  2) 建立 baseline snapshot
  3) 再把 pre-baseline 歷史折疊成單一初始 migration

3. 本次已落地的性能修正
- ExportService
  - 原本 generateResponsesExcel 對每個 response * 每個 question 都線性掃 answers，還順手再掃 options。
  - 這種寫法資料量一大就不是 O(n)，而是 O(你今晚會開始懷疑人生)。
  - 現已改成預先建立 map：
    - answerByResponseQuestion
    - optionLabelById
    - answersByQuestion
    - optionsByQuestion
- 新增索引
  - survey_responses (survey_id, status, submitted_at)
    - 對應 export/stats 熱查詢
  - point_redemptions (user_id, created_at)
    - 對應我的兌換紀錄列表

4. 後續還值得追的點
- mutual service 雖然已避免最蠢的 N+1，但仍有不少以 OR + id list 組條件的查詢，可視資料量改成 inArray / join-based loading。
- point_shop_items 的 listItems 依賴 active + stock 條件；若商品量變大，建議補 partial index。
- database.module.ts 目前 pg Pool 固定 max=10、idleTimeoutMillis=30000、connectionTimeoutMillis=2000；dev 還行，但 production 最好改成環境變數驅動，不要用硬編碼裝作自己很懂容量規劃。

5. 本次變更檔案
- apps/api/src/responses/export.service.ts
- apps/api/src/db/schema/responses.ts
- apps/api/src/db/schema/point-shop.ts
- apps/api/drizzle/qua-270-db-perf-indexes.sql
