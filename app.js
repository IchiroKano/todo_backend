/* 1. expressモジュールをロードし、インスタンス化してappに代入。*/
var express = require("express");
var mysql = require('mysql');
var app = express();
var port = 3006;
require('dotenv').config();                         //環境変数を process.env にセットする命令
const jwt = require('jsonwebtoken');

// for Datadog
const tracer = require('dd-trace').init({
  tags: {
    host: process.env.TODO_HOST,
    env: 'prod',
    service: 'todo',
    version: '1.0',
    dbmPropagationMode: 'full',
    application: 'todo'
  }
});

// `.bashrc` で設定した環境変数からユーザー情報を取得
const USERNAME = process.env.TODO_USER || "Guest";
const PASSWORD = process.env.TODO_PASSWORD || "NoPass";
const SECRET_KEY = process.env.TODO_SECRET_KEY || "NoKey";

/* 2. listen()メソッドを実行して3006番ポートで待ち受け。*/
var server = app.listen(port, function(){
    console.log("Node.js is listening to PORT:" + server.address().port);
});

// CORSを許可する
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// その他（ログイン）
const bodyParser = require('body-parser'); // ✅ body-parserを読み込み
app.use(express.json()); // JSONリクエストを解析
app.use(express.urlencoded({ extended: true })); // フォームデータを解析

// **認証ミドルウェア**
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
      console.log('認証エラー: トークンがありません');
      return res.status(401).json({ message: "認証情報が不足しています" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, SECRET_KEY, (err, user) => {
      if (err) {
          if (err.name === "TokenExpiredError") {
              console.log('認証エラー: トークンの有効期限が切れています');
              return res.status(401).json({ message: "トークンの有効期限が切れています。再ログインしてください" });
          }
          console.log('認証エラー: 無効なトークンです');
          return res.status(403).json({ message: "トークンが無効です" });
      }
      req.user = user; // ユーザー情報をリクエストに追加
      next(); // 次の処理へ
  });
};

/* 3. 以後、アプリケーション固有の処理 */

// ルートAPI
app.get('/', (req, res) => {
    res.send('OK. I am ToDo App (^_^)/');
});

// ------------------------------------
// Datadogヒートラン用テスト
// ------------------------------------
app.get('/test', (req, res) => {
  //　１．データベースに接続
  const db = connectDatabase(); 

  // 「1〜4」のランダムな数を生成
  const randomValue = Math.floor(Math.random() * 4) + 1;

  //　２．データを読み出すクエリ
  let sql = '';
  switch (randomValue) {
    case 1:
      sql = 'SELECT * FROM todo where id=1';
      break;
    case 2:
      sql = "UPDATE todo SET flag='0', plan='テスト', result='-' WHERE id=1;";
      break;
    case 3:
      sql = "INSERT INTO todo (id, flag, plan, result) VALUES (1, '0', '重複エラーを記録', '-')";
      break;
    case 4:
      res.status(400).json({ error: "無効なリクエスト" });
      return;
  }  
  db.query(sql, (err, results) => {
      if (err) {
        res.status(400).json({ error: "SQL構文エラー" });
        return;
      }
      res.status(200).json({ test: "Read or Update the todo table, id=1 OK" });
  });

  //　３．データベースを閉じる
  closeDatabase(db); 
});


// ------------------------------------
// データベースに接続する関数（=function）
// ------------------------------------
function connectDatabase() {
  // MySQLデータベースの接続情報を設定
  const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  // データベースに接続
  db.connect((err) => {
      if (err) {
        throw err;
      }
      console.log('MySQL接続は成功');
  });

  return db;
}

// ------------------------------------
// データベースを閉じる関数
// ------------------------------------
function closeDatabase(db) {
  // データベース接続を閉じる
  db.end((err) => {
    if (err) {
      console.error('DB接続を閉じるときにエラー:', err);
    } else {
      console.log('MySQLデータベース接続をクローズできました.');
    }
  });
}


// ------------------------------------
// データ読み込み（完成フラグなしを全数）
// ------------------------------------
app.get('/get', authenticateToken, (req, res) => {
  //　１．データベースに接続
  const db = connectDatabase(); 
  //　２．データを読み出すクエリ
  //let sql = 'SELECT * FROM todo';
  let sql = 'SELECT * FROM todo where flag<>1';
  db.query(sql, (err, results) => {
      if (err) {
        console.log('読み出しに失敗');
        throw err;
      }
      console.log('読み出しに成功');
      res.json(results);
  });
  //　３．データベースを閉じる
  closeDatabase(db); 
});

// ------------------------------------
// データのみ読み込み（完成フラグのみ）
// ------------------------------------
app.get('/complete', authenticateToken, (req, res) => {
  //　１．データベースに接続
  const db = connectDatabase(); 
  //　２．データを読み出すクエリ
  let sql = 'SELECT * FROM todo where flag=1';
  db.query(sql, (err, results) => {
      if (err) {
        console.log('読み出しに失敗');
        throw err;
      }
      console.log('読み出しに成功');
      res.json(results);
  });
  //　３．データベースを閉じる
  closeDatabase(db); 
});

// ------------------------------------
// データ読み込み（指定するIDのみ）
// ------------------------------------
app.get('/getUser', authenticateToken, (req, res) => {
  //　必須IDを検査
  const id = req.query.id; // クエリパラメータ `id` を取得
  console.log('[1] /getUser はID[%d]でクエリ実行', id);
  if (!id) {
    console.log('IDが必要です');
    return res.status(400).json({ error: "IDが必要です" });
  }
  //　１．データベースに接続
  const db = connectDatabase(); 
  //　３．クエリ実行
  const sql = 'SELECT * FROM todo WHERE id = ?';
  console.log('[2]クエリ実行 %s', sql);
  db.query(sql, [id], (err, results) => {
      if (err) {
          console.log('読み出しに失敗', err);
          return res.status(500).json({ error: "SQL実行, データ取得エラー" });
      }

      if (results.length === 0) {
          return res.status(404).json({ error: "SQL実行, データが見つかりません" });
      }

      console.log(`ID ${id} のデータ取得に成功`);
      res.json(results[0]); // 単一のオブジェクトを返す
  });

  closeDatabase(db); // データベース接続を閉じる
});

// ------------------------------------
// データ書き込み
// ------------------------------------
app.post('/create', authenticateToken, (req, res) => {
  //　１．データベースに接続
  const db = connectDatabase(); 

  //　２．データを書き込むクエリ
  let myFlag = req.body.flag;
  let myPlan = req.body.plan;
  let myResult = req.body.result;
  sql = "INSERT INTO todo (flag, plan, result) VALUES ('" 
    + myFlag + "', '" 
    + myPlan + "', '" 
    + myResult + "');";
  db.query(sql, (err, results) => {
    if (err) {
      console.log('データベース書き込みに失敗 INSERT for API /put in app.js');
      throw err;
    }
    res.json(results);
    console.log('DBに書き込み成功しました 🎉 INSERT for API /put in app.js');
  });

  //　３．データベースを閉じる
  closeDatabase(db); 
});

// ------------------------------------
// データ削除
// ------------------------------------
app.delete('/delete/:id', authenticateToken, (req, res) => {
  //　１．データベースに接続
  const db = connectDatabase();
  //　２．URLパラメータから `id` を取得（修正: `req.params.id` を使用）
  let myID = req.params.id;
  // IDが空ならエラーを返す
  if (!myID) {
    return res.status(400).json({ message: "削除するIDが指定されていません。" });
  }
  // SQLクエリを安全に実行（修正: プレースホルダーを使用してSQLインジェクションを防ぐ）
  let sql = "DELETE FROM todo WHERE id = ?";
  db.query(sql, [myID], (err, results) => {
    if (err) {
      console.error("DBのレコード削除に失敗:", err);
      return res.status(500).json({ message: "データベースエラー" });
    }
    res.json({ message: `ID[${myID}] を削除しました`, data: results });
    console.log(`DBのID[${myID}] を削除成功`);
  });

  //　３．データベースを閉じる
  closeDatabase(db);
});

// ------------------------------------
// データ更新
// ------------------------------------
app.put('/update/:id', authenticateToken, (req, res) => {
  // １．データベースに接続
  const db = connectDatabase();
  // ２．URLパラメータから `id` を取得（修正: `req.params.id` を使用）
  let myID = req.params.id;
  // `body` から更新データを取得（修正: `req.body` を使用）
  let myFlag = req.body.flag;
  let myPlan = req.body.plan;
  let myResult = req.body.result;
  // IDが空ならエラーを返す
  console.log('[1]更新するID', myID);
  //if (!myID || myFlag === undefined || !myPlan || !myResult) {
  if (!myID || myFlag === undefined) {
    console.log("[2]更新するID[%d]またはデータ[%s]が不足しています。", myID, myFlag);
    return res.status(400).json({ message: "更新するIDまたはデータが不足しています。" });
  }
  console.log("[3]更新するデータ:", { myID, myFlag, myPlan, myResult }); // デバッグ用ログ
  // SQLクエリを安全に実行（修正: プレースホルダーを使用）
  let sql = "UPDATE todo SET flag = ?, plan = ?, result = ? WHERE id = ?";
  db.query(sql, [myFlag, myPlan, myResult, myID], (err, results) => {
    if (err) {
      console.error("レコードの更新に失敗:", err);
      return res.status(500).json({ message: "データベースエラー" });
    }
    res.json({ message: `ID[${myID}] のデータを更新しました`, data: results });
  });
  console.log("[9]データベース更新を終了しDB閉じます");
  closeDatabase(db);  // ３．データベースを閉じる
});


app.get('/put/:myResult', (req, res) => {
  //　１．データベースに接続
  const db = connectDatabase(); 

  // データベースに接続
  db.connect((err) => {
      if (err) {
        throw err;
      }
      console.log('MySQL接続は成功');
  });

  // データを読み出すクエリ
  let sql = 'use mysql';
  db.query(sql, (err, results) => {
    if (err) {
      throw err;
    }
  });
  
  // データを書き込むクエリ
  sql = "insert into todo (userid, plan, result) values (5, '" + req.params.myResult + "', 'API入力');";
  db.query(sql, (err, results) => {
    if (err) {
      throw err;
    }
    res.json(results);
    console.error('DBに書き込み成功しました 🎉', err);
  });

  // データベース接続を閉じる
  db.end((err) => {
      if (err) {
        console.error('DB接続を閉じるときにエラー:', err);
      } else {
        console.log('MySQLデータベース接続をクローズできました.');
      }
  });

});

// 文字表示アプリ
app.get('/print/:name', (req, res) => {
  res.send( "あなたは " + req.params.name + " を入力しました");
});


// **ログインAPI**　htmlかURLオプションから取り出す
app.post('/login', (req, res) => {
  console.log('ログイン認証チェックします・・・：入力＝', req.body);
  console.log('サーバー登録値＝%S, %S', USERNAME, PASSWORD);
  console.log('キー: ', SECRET_KEY);
  const { username, password } = req.body;

  if (username === USERNAME && password === PASSWORD) {
    console.log('IDとパスワードの合致に成功！');
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '48h' });
    return res.json({ token });
  } else {
    console.log('IDとパスワードの合致に失敗！');
    res.status(401).json({ message: "IDとパスワードが違います" });
  }
});


