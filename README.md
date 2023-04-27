# bsky-skyhigh

Blueskyの廃人を検出します。  
毎日定時に設定アカウントのフォロワーを取得し、そのフォロワーの前日投稿数をカウントしています。

## 実行手順

実行にあたっては`.env.example`を書き換えてください。  
以下の手順でデプロイします

```bash
cp .env.example .env
npm install
node index.js
```

## docker環境

https://github.com/ShinoharaTa/node-docker

使用方法はリポジトリの説明を読んで下さい
