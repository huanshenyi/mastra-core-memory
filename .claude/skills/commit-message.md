---
description: Git変更内容を分析して適切なコミットメッセージを生成します
---

# コミットメッセージ生成

このスキルは、現在のgit変更内容を分析して、適切なコミットメッセージを自動生成します。

## 実行手順

1. **変更内容の確認**
   - `git status`でステージされたファイルとステージされていないファイルを確認
   - `git diff --cached`でステージされた変更の詳細を確認
   - ステージされた変更がない場合は、`git diff`で未ステージの変更を確認

2. **変更内容の分析**
   - 変更されたファイルの種類（ソースコード、設定ファイル、ドキュメント等）
   - 変更の性質（新機能、バグ修正、リファクタリング、ドキュメント更新等）
   - 変更の範囲（単一ファイル、複数ファイル、複数機能）
   - 最近のコミット履歴（`git log --oneline -10`）でプロジェクトのコミットメッセージスタイルを確認

3. **コミットメッセージの生成**

   以下の2つのスタイルで**英語の**コミットメッセージを提案してください：

   ### Option 1: Concise (1-line)
   - Single line summary of changes
   - Use Conventional Commits format
   - Prefix: `feat:`, `fix:`, `refactor:`, `docs:`, `style:`, `test:`, `chore:`, etc.

   ### Option 2: Detailed (multi-line)
   - Line 1: Summary in Conventional Commits format
   - Blank line
   - Detailed explanation (bullet points if needed)
   - Blank line
   - Footer (if needed, e.g., "Fixes #123", "BREAKING CHANGE:", etc.)

## 出力形式

各オプションを明確に区別して表示してください：

```
## Option 1: Concise
[commit message]

## Option 2: Detailed
[commit message]
```

## 注意事項

- ステージされた変更がない場合は、ユーザーに通知してください
- 変更が複数の異なる機能にまたがる場合は、コミットを分割することを推奨してください
- センシティブな情報（APIキー、パスワード等）がコミットに含まれていないか警告してください
- コミットメッセージは具体的で、「何を」よりも「なぜ」を重視してください

## プロジェクト固有のルール

このプロジェクトのコミット履歴から、プロジェクト固有のコミットメッセージスタイルやパターンを学習し、それに従ってください。
