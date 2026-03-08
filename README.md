# kyodemo.net-downloader

kyodemo.net のスレッドからテキストを抽出し、整形済みの `.txt` ファイルとして保存する Tampermonkey ユーザースクリプトです。

## 機能

- 📥 **全レス自動展開** — 「続き」ボタンを自動クリックして、ページ分割されたすべてのレスを展開します
- 📖 **省略コンテンツの展開** — 「続きN行」で折りたたまれた長文レスも自動で展開します
- 🔗 **元BBS URLの復元** — kyodemo のミラーURLから元の BBS（eddibb.cc）のスレッドURLを自動復元します
- 🏷️ **投稿回数の表示** — 各レスに投稿者のスレッド内投稿回数 `(1/8)` を付与します
- 💾 **ワンクリック保存** — 整形済みテキストを `.txt` ファイルとしてダウンロードします

## 出力例

```
回転寿司10皿、結構キツいwww
元スレ: https://hayabusa9.5ch.io/test/read.cgi/mnewsplus/1772973160/
Kyodemo: https://www.kyodemo.net/sdemo/r/mnewsplus/1772973160/1-

1: エッヂの名無し  2026/03/08(日) 20:26:40.66 ID:220hR8ykI(1/8)
最初に勢い余って頼みすぎちゃって後悔
2: エッヂの名無し  2026/03/08(日) 20:26:54.90 ID:ozZL8eq3V(1/3)
余裕だ
```

## インストール

### 前提条件

- [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Firefox / Edge 対応）

### 手順

1. ブラウザに Tampermonkey 拡張機能をインストール
2. Tampermonkey ダッシュボードを開き「新規スクリプト」を作成
3. [`kyodemo.net-downloader.js`](kyodemo.net-downloader.js) の内容をすべてコピー＆ペースト
4. 保存（Ctrl+S）

## 使い方

1. `kyodemo.net` のスレッドページにアクセスします。
2. 画面右下に表示される **「📥 Kyodemo Downloader」** パネルを確認します。
3. 用途に応じて2つのボタンのうちどちらかをクリックします：
   - **「全レス保存（1〜最新）」**: 現在の中途半端なページにいる場合、自動的にURLを `.../1-` にリダイレクトして1レス目から読み直した上で、全レスを展開して保存します。
   - **「現在のレスから続きを保存」**: 現在表示されているレス番からスタートし、最後尾まで展開して保存します。
4. 自動でレスの展開が完了すると、整形済みテキストが `.txt` ファイルとしてダウンロードされます。

## 対応URL

```
*://*.kyodemo.net/*/r/*
```

## 設計

コードの可読性・保守性のため、以下のクラス構成で設計されています：

| クラス | 責務 |
|---|---|
| `UIBuilder` | 操作パネル（GUI）の構築・状態表示の管理 |
| `DataExtractor` | ページネーション展開・トグル展開・DOMパース・テキスト整形 |
| `FileSaver` | Blob生成とファイルダウンロード処理 |

## ライセンス

MIT License

## 作者

[Aerin-the-Lion](https://github.com/Aerin-the-Lion)