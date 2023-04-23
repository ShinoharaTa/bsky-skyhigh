import dotenv from "dotenv";
import bsky from "@atproto/api";
import moment from "moment-timezone";

dotenv.config();
const { BskyAgent } = bsky;

let self = null;
const agent = new BskyAgent({ service: "https://bsky.social" });
const prevDay = moment().tz("Asia/Tokyo").subtract(1, "days").startOf("day");
const today = moment().tz("Asia/Tokyo").startOf("day");

const login = async function () {
  try {
    const { success, data } = await agent.login({
      identifier: process.env.AUTHOR,
      password: process.env.PASSWORD,
    });
    self = data;
    return success ? data : null;
  } catch {
    return null;
  }
};

const post = async function (text) {
  return agent.api.app.bsky.feed.post.create(
    { repo: self.handle },
    {
      text: text,
      createdAt: new Date().toISOString(),
    }
  );
};

const getFollowers = async function (user_name) {
  let cursor = null;
  let users = [];
  for (let index = 0; index < 20; index++) {
    let request = {
      actor: user_name,
      limit: 100,
    };
    if (cursor) {
      request.cursor = cursor;
    }
    const { success, data } = await agent.api.app.bsky.graph.getFollowers(
      request
    );
    console.log(data.followers.length);
    const getUsers = data.followers.map((item) => {
      return {
        handle: item.handle,
        name: item.displayName,
      };
    });
    users = users.concat(getUsers);
    if (data.cursor) {
      cursor = data.cursor;
    } else {
      break;
    }
  }
  return users;
};

const getPosts = async function (user_name) {
  let maxCount = 0;
  let cursor = null;
  for (let index = 0; index < 5; index++) {
    let request = {
      actor: user_name,
      limit: 100,
    };
    if (cursor) {
      request.cursor = cursor;
    }
    const { success, data } = await agent.api.app.bsky.feed.getAuthorFeed(
      request
    );
    const filterd = data.feed.filter((item) => {
      const itemDate = moment(item.post.indexedAt).tz("Asia/Tokyo");
      return (
        itemDate.isSameOrAfter(prevDay) &&
        itemDate.isBefore(today) &&
        item.reason?.$type !== "app.bsky.feed.defs#reasonRepost"
      );
    });
    maxCount += filterd.length;
    if (data.cursor) {
      cursor = data.cursor;
    } else {
      break;
    }
    const end = filterd.find((item) => {
      const itemDate = moment(item.post.indexedAt).tz("Asia/Tokyo");
      return (
        itemDate.isBefore(prevDay) &&
        item.reason?.$type !== "app.bsky.feed.defs#reasonRepost"
      );
    });
    if (!!end) break;
  }
  return maxCount;
};

const getUserPosts = async function (user) {
  try {
    const posts = await getPosts(user.handle);
    return {
      name: user.name,
      handle: user.handle,
      posts: posts,
    };
  } catch (ex) {
    return {
      name: user.name,
      handle: user.handle,
      posts: "error",
    };
  }
};

const result = await login();
console.log(result);

if (result) {
  try {
    let time = moment().tz("Asia/Tokyo").format("YYYY/MM/DD HH:mm:ss");
    post("集計開始：" + time + "");
    const users = await getFollowers(process.env.AUTHOR);
    const posts = [];

    for (const user of users) {
      const userPosts = await getUserPosts(user);
      posts.push(userPosts);
    }
    const filtering = posts.filter((item) => typeof item.posts === "number");
    const sorted = filtering.sort((a, b) => b.posts - a.posts);
    let text =
      "【すか廃ランキング " + prevDay.format("YYYY/MM/DD") + "】#skyhighrank\n";
    for (let index = 0; index < 10; index++) {
      let record = index === 0 ? "👑：" : index + 1 + "位：";
      record += sorted[index].posts + " " + sorted[index].name + "\n";
      if (text.length + record.length > 300) {
        break;
      } else {
        text += record;
      }
    }
    post(text);

    // 投稿後の定型文投稿
    text = "廃人ランキングは以下の基準で。\n\n";
    text += "1. @skyhigh.bsky.social をフォローしている\n";
    text += "2. リポストは含まない\n";
    text += "3. リプはカウント対象内\n";
    text += "4. 一日500投稿以上まで集計\n";
    text += "5. にゃーん\n";
    post(text);

    time = moment().tz("Asia/Tokyo").format("YYYY/MM/DD HH:mm:ss");
    post("集計終了：" + time + "");

    const missing = posts.filter((item) => item.posts === "error");
    console.log(missing);
  } catch (ex) {
    let text = "@shino3.bsky.social \n";
    text += "\n";
    text += "エラーが起きて動いてないよっ！！\n";
    text += "助けてーーー（>__<）\n";
    text += "※だれかしのさん宛に引用リポストしてくださいm(_ _)m\n";
    post(text);
    console.log(ex);
  }
}
