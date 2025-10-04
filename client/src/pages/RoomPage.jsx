import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import API from "../services/api";
import ChatRoom from "./ChatRoom";

export default function RoomPage() {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await API.get(`/rooms/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRoom(res.data);
      } catch (err) {
        setError(err.response?.data?.msg || "Failed to load room");
      } finally {
        setLoading(false);
      }
    };
    fetchRoom();
  }, [roomId]);

  if (loading) return <p>Loading room...</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>{room.name}</h1>
      <p>{room.description}</p>
      <h3>Members:</h3>
      <ul>
        {room.members.map((m) => (
          <li key={m._id}>{m.username}</li>
        ))}
      </ul>

      {/* Chat UI */}
      <ChatRoom />
    </div>
  );
}
