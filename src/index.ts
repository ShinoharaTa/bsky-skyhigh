import dotenv from "dotenv";
import { BskyAgent, RichText } from "@atproto/api";
import type { QueryParams } from "@atproto/api/dist/client/types/app/bsky/graph/getFollowers";
import type { QueryParams as PostQueryParams } from "@atproto/api/dist/client/types/app/bsky/feed/getAuthorFeed";
import type { OutputSchema } from "@atproto/api/dist/client/types/app/bsky/actor/getProfile";
import moment from "moment-timezone";

dotenv.config();

let self: OutputSchema;
const agent = new BskyAgent({ service: "https://bsky.social" });
const prevDay = moment().tz("Asia/Tokyo").subtract(1, "days").startOf("day");
const today = moment().tz("Asia/Tokyo").startOf("day");

const login = async () => {
  try {
    const { success, data } = await agent.login({
      identifier: process.env.AUTHOR ?? "",
      password: process.env.PASSWORD ?? "",
    });
    self = data;
    return success ? data : null;
  } catch {
    return null;
  }
};

const post = async (text: string) => {
  const rt = new RichText({ text });
  await rt.detectFacets(agent);
  await agent.post({
    $type: "app.bsky.feed.post",
    text: rt.text,
    facets: rt.facets,
    langs: ["ja"]
  });
};

const getFollowers = async (user_name: string) => {
  let cursor = null;
  let users: { handle: string; name: string | undefined }[] = [];
  for (let index = 0; index < 20; index++) {
    const request: QueryParams = {
      actor: user_name,
      limit: 100,
    };
    if (cursor) {
      request.cursor = cursor;
    }
    const { data } = await agent.api.app.bsky.graph.getFollowers(request);
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

const getPosts = async (user_name: string) => {
  let maxCount = 0;
  let cursor = null;
  for (let index = 0; index < 20; index++) {
    const request: PostQueryParams = {
      actor: user_name,
      limit: 100,
    };
    if (cursor) {
      request.cursor = cursor;
    }
    const { data } = await agent.api.app.bsky.feed.getAuthorFeed(request);
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
    if (end) break;
  }
  return maxCount;
};

const getUserPosts = async (user: {
  handle: string;
  name: string | undefined;
}) => {
  let posts: number;
  try {
    posts = await getPosts(user.handle);
  } catch (ex) {
    return null
  }
  return {
    name: user.name,
    handle: user.handle ?? "",
    posts: posts,
  };
};

const result = await login();
console.log(result);

if (result) {
  try {
    let time = moment().tz("Asia/Tokyo").format("YYYY/MM/DD HH:mm:ss");
    const users = await getFollowers(process.env.AUTHOR ?? "");
    post(`集計開始：${time} users: ${users.length}`);
    const posts = [];

    for (const user of users) {
      const userPosts = await getUserPosts(user);
      if (userPosts) posts.push(userPosts);
    }
    const sorted = posts
      .filter((item) => item.posts !== 0)
      .sort((a, b) => b.posts - a.posts);
    let text = `【すか廃ランキング ${prevDay.format(
      "YYYY/MM/DD"
    )}】#skyhighrank\n`;
    for (let index = 0; index < sorted.length; index++) {
      if(index >= 10) break;
      let record = index === 0 ? "👑：" : `${index + 1}位：`;
      record += `${sorted[index].posts > 999 ? "999+" : sorted[index].posts} ${sorted[index].name}\n`;
      if (text.length + record.length > 300) {
        break;
      }
      text += record;
    }
    post(text);

    // 投稿後の定型文投稿
    text = "廃人ランキングの集計条件は以下のとおりです。\n\n";
    text += "1. @skyhigh.bsky.social をフォローしている\n";
    text += "2. リポストは含まない\n";
    text += "3. リプはカウント対象内\n";
    text += "4. 集計時点から3000投稿まで集計\n";
    text += "5. しのさんに感謝のコーラを奢ることができる\n";
    post(text);

    time = moment().tz("Asia/Tokyo").format("YYYY/MM/DD HH:mm:ss");
    post(`集計終了：${time}`);

    const missing = posts.filter((item) => item.posts === 0);
    console.log(missing);
  } catch (ex) {
    let text = "@shino3.net \n";
    text += "\n";
    text += "エラーが起きて動いてないよっ！！\n";
    text += "助けてーーー（>__<）\n";
    post(text);
    console.log(ex);
  }
}
