import { ArduinoMessage } from "@/types/global";
import { Terminal } from "lucide-react";

export default function SerialMessage({ message }: { message: ArduinoMessage }){
    return (
        <div className="flex items-center border-b border-b-gray-300 w-full p-5">
            <Terminal className="size-4 mr-4"/>
            <p className="text-lg">{message.message}</p>
            <p className="text-sm text-gray-400 ml-auto">{new Date(message.createdAt).toLocaleTimeString()} · {message.arduino.path}</p>
        </div>
    )
}