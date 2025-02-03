
import { SQSClient, ListQueuesCommand, SendMessageCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
const client = new SQSClient({ region: "af-south-1" });

export async function push(data: Object){
    await client.send(new SendMessageCommand({
        QueueUrl: process.env.QUEUE_URL,
        MessageBody: JSON.stringify(data),
    }));
}

export async function pop(){
    const data = await client.send(new ReceiveMessageCommand({
        QueueUrl: process.env.QUEUE_URL,
    }));
    return data;
}
