// ==UserScript==
// @name         kyodemo.net-downloader
// @namespace    http://tampermonkey.net/
// @version      1.0.2.0
// @description  kyodemo.netからテキストを抽出し、元BBSのURLを復元して保存するスクリプト
// @author       Aerin-the-Lion
// @match        *://*.kyodemo.net/*/r/*
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    // ==========================================
    // UI構築クラス
    // ==========================================
    class UIBuilder {
        constructor(onStartExtraction) {
            this.onStartExtraction = onStartExtraction;
            this.container = null;
            this.statusLabel = null;
            this.button = null;
        }

        build() {
            this.container = document.createElement('div');
            this.container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(30, 30, 30, 0.9);
                color: #fff;
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                z-index: 99999;
                font-family: sans-serif;
                min-width: 200px;
                text-align: center;
            `;

            const title = document.createElement('div');
            title.textContent = '📥 Kyodemo Downloader';
            title.style.cssText = 'font-weight: bold; margin-bottom: 10px; font-size: 14px;';

            // 第1ボタン：全レス保存（URLを /1- にして再読み込み、その後実行）
            this.btnAll = document.createElement('button');
            this.btnAll.textContent = '全レス保存（1〜最新）';
            this.btnAll.style.cssText = `
                background: #007bff;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                width: 100%;
                font-weight: bold;
                transition: background 0.2s;
                margin-bottom: 8px;
            `;

            this.btnAll.addEventListener('click', async () => {
                const url = window.location.href;
                // URLの末尾が「/数字-」で終わっていない、あるいは中途半端なパスが含まれている場合は「/1-」にリダイレクト
                if (!url.match(/\/\d+-$/) || url.includes('/n')) {
                    this.updateStatus('1レス目から読み込むためリダイレクトします...');
                    // URLからスレッドIDまでのベースURLを抽出し、その後ろに '1-' を付ける
                    const match = url.match(/(https?:\/\/[^/]+\/sdemo\/r\/[^/]+\/\d+\/).*/);
                    if (match) {
                        window.location.href = match[1] + '1-';
                    } else {
                        // パターンに合わない場合の簡易フォールバック
                        const baseUrl = url.replace(/(\/[^/]+)?-?(\?.*)?$/, '');
                        window.location.href = baseUrl + '/1-';
                    }
                    return;
                }

                this.setLoadingState(true);
                try {
                    await this.onStartExtraction(this);
                } catch (err) {
                    console.error(err);
                    this.updateStatus('エラーが発生しました。コンソールをご確認ください。');
                } finally {
                    this.setLoadingState(false);
                }
            });

            // 第2ボタン：現在の画面の続きから保存
            this.btnCurrent = document.createElement('button');
            this.btnCurrent.textContent = '現在のレスから続きを保存';
            this.btnCurrent.style.cssText = `
                background: #28a745;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                width: 100%;
                font-weight: bold;
                transition: background 0.2s;
            `;

            this.btnCurrent.addEventListener('click', async () => {
                this.setLoadingState(true);
                try {
                    await this.onStartExtraction(this);
                } catch (err) {
                    console.error(err);
                    this.updateStatus('エラーが発生しました。コンソールをご確認ください。');
                } finally {
                    this.setLoadingState(false);
                }
            });

            this.statusLabel = document.createElement('div');
            this.statusLabel.style.cssText = 'margin-top: 10px; font-size: 12px; color: #aaa;';
            this.statusLabel.textContent = '待機中...';

            this.container.appendChild(title);
            this.container.appendChild(this.btnAll);
            this.container.appendChild(this.btnCurrent);
            this.container.appendChild(this.statusLabel);
            document.body.appendChild(this.container);
        }

        updateStatus(message) {
            if (this.statusLabel) this.statusLabel.textContent = message;
        }

        setLoadingState(isLoading) {
            this.btnAll.disabled = isLoading;
            this.btnCurrent.disabled = isLoading;
            this.btnAll.style.background = isLoading ? '#555' : '#007bff';
            this.btnCurrent.style.background = isLoading ? '#555' : '#28a745';
        }
    }

    // ==========================================
    // データ抽出クラス
    // ==========================================
    class DataExtractor {
        constructor() {
            this.nextButtonSelector = 'a[data-tag="rlist"].button.d-continu';
            this.postSelector = 'div.post[class*="p"]';
            this.totalCommentsSelector = 'small.d-scnt';
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async expandAllPosts(ui) {
            let count = 0;
            let previousPostCount = 0;
            let maxPosts = Infinity;

            // 初期状態でDOMに存在する総レス数を取得して上限を設ける（泥臭いが確実な方法）
            const scntEl = document.querySelector(this.totalCommentsSelector);
            if (scntEl) {
                // "365(2/8)" のようなテキストから先頭の数字部分を抽出
                const match = scntEl.textContent.match(/^\s*(\d+)/);
                if (match) {
                    maxPosts = parseInt(match[1], 10);
                    // 万が一非同期による追加で誤差が出るのを防ぐため、少しだけバッファを持たせる
                    maxPosts += 50;
                    console.log(`[Kyodemo Downloader] ターゲット最大レス数: 約${maxPosts}`);
                }
            }

            while (true) {
                const posts = document.querySelectorAll(this.postSelector);
                const currentPostsCount = posts.length;

                // kyodemoのバグ（同じボタンを何度も押すと、同じレス群がDOMに重複して追加されてしまう）に対抗するため、
                // DOM上の「一番最後のレスの番号（ID）」を読み取って、それがスレッド全体の最大レス数付近に達しているかチェックする。
                if (posts.length > 0) {
                    const lastPost = posts[posts.length - 1];
                    const rHead = lastPost.querySelector('.r-head strong');
                    if (rHead) {
                        const lastResNum = parseInt(rHead.textContent.trim(), 10);
                        if (!isNaN(lastResNum) && lastResNum >= maxPosts - 50) { // バッファ分を引いて元の最大数で比較
                            console.log(`[Kyodemo Downloader] 最後のレス番号(${lastResNum})がスレッドの最大数付近(${maxPosts - 50})に達したため終了します。`);
                            break;
                        }
                    }
                }

                // 今回と前回で要素数が全く変わっていなければ、行き止まりとみなす（無限ループの絶対阻止）
                if (count > 0 && currentPostsCount === previousPostCount) {
                    console.log("[Kyodemo Downloader] DOM上の要素数に変化がないためループを終了します。");
                    break;
                }
                previousPostCount = currentPostsCount;

                // 要素数が異常値に達した場合の強制終了（暴走防止）
                if (currentPostsCount >= maxPosts * 3) {
                    console.log(`[Kyodemo Downloader] 取得要素数(${currentPostsCount})が異常値に達したため強制終了します。`);
                    break;
                }

                // DOM上のすべての「続き」ボタンを取得
                const nextBtns = document.querySelectorAll(this.nextButtonSelector);

                // 表示されている（非表示ではない）ボタンを探す（kyodemo側の罠：最後のボタンが消えない問題に対処）
                const visibleBtn = Array.from(nextBtns).find(btn => btn.offsetParent !== null);

                if (!visibleBtn) {
                    break; // 表示されているボタンがなければループを抜ける
                }

                count++;
                ui.updateStatus(`追加レス読み込み中... (${count}回目 / DOM要素数:${currentPostsCount}件)`);
                visibleBtn.click();

                // データのフェッチとDOMの更新を待機する。環境によっては足りないかもしれないので長めに。
                await this.sleep(2000);
            }
            ui.updateStatus(`全レス展開完了（合計約${document.querySelectorAll(this.postSelector).length}レス）。パース中...`);
        }

        // 「続きN行」トグルボタンをすべてクリックして、省略されたコンテンツを展開する
        async expandAllToggles(ui) {
            const toggleBtns = document.querySelectorAll('a[href="#toggle"].button');
            if (toggleBtns.length > 0) {
                ui.updateStatus(`省略レスを展開中... (${toggleBtns.length}件)`);
                toggleBtns.forEach(btn => btn.click());
                await this.sleep(500); // DOMの更新を待つ
            }
        }

        extract() {
            // スレタイから余計なサイト名を削除して整形
            let title = document.title || "不明なスレッド";
            title = title.replace(/\s*-\s*kyodemo.*/i, "").trim();

            // 現在のkyodemoのURL
            const kyodemoUrl = window.location.href;

            // 元のBBSのURLを構築
            let originalUrl = "";
            const firstButton = document.querySelector('a.l-button');
            if (firstButton) {
                const href = firstButton.getAttribute('href') || '';
                // URLから板名とスレッドキーを抽出（例: /sdemo/b/mnewsplus/?hi=...&key=1772973160）
                const match = href.match(/\/sdemo\/b\/([^/]+)\/.*[?&]key=(\d+)/);
                if (match) {
                    let board = match[1];
                    if (board.startsWith('e_e_')) {
                        board = board.substring(4); // e_e_liveedge などの先頭識別子を削除
                        originalUrl = `https://bbs.eddibb.cc/test/read.cgi/${board}/${match[2]}/`;
                    } else {
                        // e_e_ がついていない場合（5chなど）
                        // ※厳密にはホスト名は板によるが、代表的なものとしてhayabusa9等のフォーマットに寄せるのは難しいため、
                        // スレッド内に存在する本スレリンク（a[target="_blank"]）から推測する
                        const sourceLink = document.querySelector('.post .clmess a[href*="test/read.cgi"]');
                        if (sourceLink) {
                            originalUrl = sourceLink.href;
                        } else {
                            // フォールバック（ホスト名は不確定だが、板とキーでそれっぽく）
                            originalUrl = `https://itest.5ch.net/${board}/test/read.cgi/${match[2]}/`;
                        }
                    }
                }
            }

            // それでもダメならDOM内の別要素から強引に取得を試みる
            if (!originalUrl || originalUrl === "") {
                const sourceAnchor = document.querySelector('a[href*="5ch.net/test/read.cgi"], a[href*=".5ch.io/test/read.cgi"]');
                if (sourceAnchor) {
                    originalUrl = sourceAnchor.href;
                } else {
                    originalUrl = "元スレッドURL不明";
                }
            }

            let resultText = `${title}\n元スレ: ${originalUrl}\nKyodemo: ${kyodemoUrl}\n\n`;

            const posts = document.querySelectorAll(this.postSelector);
            if (posts.length === 0) {
                return resultText + "レスが見つかりませんでした。";
            }

            posts.forEach(post => {
                try {
                    const rHead = post.querySelector('.r-head strong');
                    const resNum = rHead ? rHead.textContent.trim() : "";

                    const nameEl = post.querySelector('.clname');
                    const name = nameEl ? nameEl.textContent.trim() : "";

                    const dateEl = post.querySelector('.cldate');
                    let dateStr = dateEl ? dateEl.textContent.trim() : "";
                    // 日付のミリ秒の桁数を2桁に整形
                    dateStr = dateStr.replace(/\.(\d{2})\d$/, '.$1');

                    const idEl = post.querySelector('.clid');
                    const id = idEl ? idEl.textContent.trim() : "???";

                    // 投稿回数を取得する。IDリンクの次にある2つ目の a.l-button に "(1/8)" のようなテキストが直接入っている
                    let postCountStr = "";
                    const lButtons = post.querySelectorAll('a.l-button');
                    if (lButtons.length >= 2) {
                        postCountStr = lButtons[1].textContent.trim(); // 例: "(1/8)"
                    }

                    const messEl = post.querySelector('.clmess');

                    let message = "";
                    if (messEl) {
                        const clone = messEl.cloneNode(true);
                        // 不要なUI要素を除去（トグルボタン、画像、画像検索ボタン）
                        clone.querySelectorAll('a[href="#toggle"]').forEach(el => el.remove());
                        clone.querySelectorAll('img').forEach(el => el.remove());
                        clone.querySelectorAll('a.button').forEach(el => el.remove());
                        // ブロック要素（div）の境界に改行を挿入して、テキストがベタ繋がりにならないようにする
                        clone.querySelectorAll('div').forEach(el => el.insertAdjacentText('afterend', '\n'));
                        // <br>タグを改行コードに変換
                        clone.innerHTML = clone.innerHTML.replace(/<br\s*[\/]?>/gi, "\n");
                        message = clone.textContent.trim().replace(/\n{3,}/g, "\n\n"); // 余剰改行を整理
                    }

                    resultText += `${resNum}: ${name}  ${dateStr} ID:${id}${postCountStr}\n${message}\n`;
                } catch (e) {
                    console.warn("レスの抽出中にエラーが発生しました:", post, e);
                }
            });

            return resultText;
        }
    }

    // ==========================================
    // ファイル保存クラス
    // ==========================================
    class FileSaver {
        static save(text, defaultFilename = "thread.txt") {
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');

            a.href = url;
            a.download = defaultFilename;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    // ==========================================
    // メイン制御
    // ==========================================
    const init = () => {
        const extractor = new DataExtractor();

        const ui = new UIBuilder(async (uiInstance) => {
            await extractor.expandAllPosts(uiInstance);
            await extractor.expandAllToggles(uiInstance);
            const extractedText = extractor.extract();

            let safeTitle = document.title || "extracted_thread";
            safeTitle = safeTitle.replace(/\s*-\s*kyodemo.*/i, "").trim().replace(/[\\/:*?"<>|]/g, "_");

            FileSaver.save(extractedText, `${safeTitle}.txt`);

            uiInstance.updateStatus('処理が完了しました。');
            setTimeout(() => uiInstance.updateStatus('待機中...'), 3000);
        });

        ui.build();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
