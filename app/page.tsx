import { Alazer } from "@/lib/alazer";
import Client from "./client";

const alazer = new Alazer({
    baseURL: "http://localhost:3000/"
})

export default async function Page(){
    const ips = await alazer.getNextIPs()
    return <Client ips={ips}/>
}