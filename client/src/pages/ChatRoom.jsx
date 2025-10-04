import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { initSocket, getSocket } from "../services/socket";

export default function ChatRoom() {
  const { roomId } = useParams();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [members, setMembers] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const s = initSocket();

    if (!s.connected) {
      s.connect();
    }

    s.emit("join_room", { roomCode: roomId });

    s.on("receive_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    s.on("room_members", (list) => {
      setMembers(list); // Expects [{ userId, username, online }, ...]
    });

    return () => {
      s.emit("leave_room", { roomCode: roomId });
      s.off("receive_message");
      s.off("room_members");
      s.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!text.trim()) return;
    const sk = getSocket();
    sk.emit("send_message", { roomCode: roomId, text });
    setText("");
  };

  return (
    <div style={{ padding: "20px" }}>
      {/* Members List Moved to Top */}
      <div style={{ borderTop: "1px solid #ccc", paddingTop: "10px", marginBottom: "10px" }}>
        <h4>
          Members ({members.filter(m => m.online).length} online):
        </h4>
        <ul>
          {members
            .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0)) // Online on top
            .map((m) => (
              <li
                key={m.userId}
                style={{ color: m.online ? "green" : "gray" }}
              >
                {m.username}
              </li>
            ))}
        </ul>
      </div>

      <h2>Room: {roomId}</h2>
      <div
        style={{
          height: "400px",
          overflowY: "auto",
          border: "1px solid #ccc",
          padding: "10px",
          marginBottom: "10px",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: "8px",
              fontStyle: m.author === "System" ? "italic" : "normal",
              color: m.author === "System" ? "gray" : "black",
            }}
          >
            {m.author !== "System" && <b>{m.author}</b>}{" "}
            {m.author !== "System" && <small>[{m.time}]</small>}
            <div>{m.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message..."
        style={{ width: "80%", marginRight: "10px", padding: "8px" }}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}