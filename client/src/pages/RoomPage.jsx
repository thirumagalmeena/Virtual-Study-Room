import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API from "../services/api";
import socketService from "../services/socket";
import FileSharing from "../components/FileSharing";

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [roomMembers, setRoomMembers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch room data, user info, and message history
  useEffect(() => {
    const fetchRoomAndUser = async () => {
      try {
        const token = localStorage.getItem("token");
        
        // Fetch room data
        const roomRes = await API.get(`/rooms/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRoom(roomRes.data);

        // Fetch message history
        await fetchMessageHistory();

        // Get current user info
        const userData = JSON.parse(localStorage.getItem("user") || "{}");
        setCurrentUser({
          id: userData.id,
          username: userData.username
        });
      } catch (err) {
        setError(err.response?.data?.msg || "Failed to load room");
      } finally {
        setLoading(false);
      }
    };
    fetchRoomAndUser();
  }, [roomId]);

  // Fetch message history
  const fetchMessageHistory = async (beforeTimestamp = null) => {
    try {
      setLoadingHistory(true);
      
      const params = { limit: 50 };
      if (beforeTimestamp) {
        params.before = beforeTimestamp;
      }
      
      const response = await API.get(`/messages/room/${roomId}`, { params });
      
      if (beforeTimestamp) {
        // Append older messages at the beginning
        setMessages(prev => [...response.data.messages, ...prev]);
      } else {
        // Replace messages (initial load)
        setMessages(response.data.messages);
      }
      
      setHasMoreMessages(response.data.hasMore);
      
      // Scroll to bottom only on initial load
      if (!beforeTimestamp) {
        setTimeout(scrollToBottom, 100);
      }
    } catch (error) {
      console.error("Error fetching message history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load more messages when scrolling to top
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container && container.scrollTop === 0 && hasMoreMessages && !loadingHistory) {
      const oldestMessage = messages[0];
      if (oldestMessage) {
        fetchMessageHistory(oldestMessage.createdAt);
      }
    }
  };

  // Socket connection and event handlers
  useEffect(() => {
    // Connect to socket
    const socketInstance = socketService.connect();
    setSocket(socketInstance);

    // Socket event listeners
    socketInstance.on("connect", () => {
      console.log("Connected to socket");
      setIsConnected(true);
      // Join the room after connection
      socketInstance.emit("join_room", { roomCode: roomId });
    });

    socketInstance.on("disconnect", () => {
      console.log("Disconnected from socket");
      setIsConnected(false);
    });

    socketInstance.on("receive_message", (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socketInstance.on("room_members", (members) => {
      console.log("Room members updated:", members);
      setRoomMembers(members);
    });

    // Cleanup on unmount
    return () => {
      socketInstance.off("connect");
      socketInstance.off("disconnect");
      socketInstance.off("receive_message");
      socketInstance.off("room_members");
      
      // Leave room when component unmounts
      if (socketInstance && isConnected) {
        socketInstance.emit("leave_room", { roomCode: roomId });
      }
    };
  }, [roomId, isConnected]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket && isConnected) {
      socket.emit("send_message", {
        roomCode: roomId,
        text: newMessage.trim()
      });
      setNewMessage("");
    } else {
      console.error("Cannot send message: Socket not connected");
    }
  };

  const handleLeaveRoom = async () => {
    try {
      // Emit leave room event to socket
      if (socket && isConnected) {
        socket.emit("leave_room", { roomCode: roomId });
      }

      // Also call API to remove from database
      const token = localStorage.getItem("token");
      await API.post("/rooms/leave", 
        { roomId: roomId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Successfully left room in both socket and database");
      
      // Navigate back to home
      navigate("/home");
    } catch (err) {
      console.error("Error leaving room:", err);
      // Still navigate even if API call fails
      navigate("/home");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  // Format message timestamp
  const formatMessageTime = (timestamp) => {
    if (!timestamp) return "";
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      // Today - show time only
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      // Older than 24 hours - show date and time
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  // Check if messages should be grouped
  const shouldGroupMessages = (currentMsg, previousMsg) => {
    if (!previousMsg || currentMsg.type === "system" || previousMsg.type === "system") {
      return false;
    }
    
    if (currentMsg.userId !== previousMsg.userId) {
      return false;
    }
    
    const currentTime = new Date(currentMsg.timestamp || currentMsg.createdAt);
    const previousTime = new Date(previousMsg.timestamp || previousMsg.createdAt);
    const timeDiff = (currentTime - previousTime) / (1000 * 60); // Difference in minutes
    
    return timeDiff < 5; // Group if less than 5 minutes apart
  };

  if (loading) return (
    <div style={{ 
      display: "flex", 
      justifyContent: "center", 
      alignItems: "center", 
      height: "100vh" 
    }}>
      <p>Loading room...</p>
    </div>
  );

  if (error) return (
    <div style={{ 
      display: "flex", 
      justifyContent: "center", 
      alignItems: "center", 
      height: "100vh",
      color: "red" 
    }}>
      <p>{error}</p>
    </div>
  );

  return (
    <div style={{ 
      padding: "20px", 
      display: "flex", 
      flexDirection: "column", 
      height: "100vh",
      backgroundColor: "#f5f5f5"
    }}>
      {/* Room Header */}
      <div style={{ 
        backgroundColor: "white",
        padding: "20px",
        borderRadius: "8px",
        border: "1px solid #e0e0e0",
        marginBottom: "20px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
      }}>
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "flex-start" 
        }}>
          <div>
            <h1 style={{ margin: "0 0 8px 0", color: "#333" }}>{room.name}</h1>
            <p style={{ margin: "0 0 12px 0", color: "#666" }}>{room.description}</p>
            <div style={{ fontSize: "0.9rem", color: "#888" }}>
              Room ID: <strong>{room.roomId}</strong> • 
              Messages: <strong>{messages.length}</strong> • 
              Capacity: {roomMembers.filter(m => m.online).length}/{room.capacity} • 
              {room.isPrivate ? " Private Room" : " Public Room"} •
              <span style={{ 
                color: isConnected ? "#4CAF50" : "#ff4444",
                fontWeight: "bold",
                marginLeft: "8px"
              }}>
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
          <button 
            onClick={handleLeaveRoom}
            style={{ 
              backgroundColor: "#ff4444", 
              color: "white", 
              border: "none", 
              padding: "10px 20px", 
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: "500"
            }}
          >
            Leave Room
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ 
        display: "flex", 
        flex: 1, 
        gap: "20px",
        minHeight: 0
      }}>
        {/* Left Column - Video, Files & Notes */}
        <div style={{ 
          flex: 3, 
          display: "flex", 
          flexDirection: "column", 
          gap: "20px",
          minWidth: 0
        }}>
          {/* Video Conference Area */}
          <div style={{ 
            flex: 2,
            backgroundColor: "white", 
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
            <div style={{ textAlign: "center", color: "#666" }}>
              <h3>Video Conference</h3>
              <p>Video functionality coming soon...</p>
            </div>
          </div>

          {/* File Sharing & Notes Area */}
          <div style={{ 
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            minWidth: 0
          }}>
            {/* File Sharing Component */}
            <FileSharing roomCode={roomId} currentUser={currentUser} />
            
            {/* Shared Notes Area */}
            <div style={{ 
              backgroundColor: "white", 
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              padding: "20px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
            }}>
              <h3 style={{ margin: "0 0 15px 0" }}>Shared Notes</h3>
              <textarea
                placeholder="Start taking shared notes... (Feature in development)"
                style={{
                  width: "100%",
                  height: "120px",
                  padding: "12px",
                  border: "1px solid #e0e0e0",
                  borderRadius: "4px",
                  resize: "vertical",
                  fontSize: "0.9rem",
                  fontFamily: "inherit"
                }}
                disabled
              />
              <p style={{ 
                fontSize: "0.8rem", 
                color: "#999", 
                marginTop: "8px",
                fontStyle: "italic"
              }}>
                Collaborative notes feature coming soon
              </p>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div style={{ 
          flex: 1,
          minWidth: "400px",
          maxWidth: "500px",
          display: "flex",
          flexDirection: "column"
        }}>
          <div style={{ 
            display: "flex", 
            flexDirection: "column",
            height: "100%",
            border: "1px solid #e0e0e0",
            borderRadius: "8px",
            backgroundColor: "white",
            overflow: "hidden"
          }}>
            {/* Chat Header */}
            <div style={{ 
              padding: "15px 20px",
              borderBottom: "1px solid #e0e0e0",
              backgroundColor: "#f8f9fa"
            }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Chat</h3>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                fontSize: "0.8rem",
                color: "#666",
                marginTop: "4px"
              }}>
                <div style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: isConnected ? "#4CAF50" : "#ff4444",
                  marginRight: "6px"
                }}></div>
                <span>
                  {roomMembers.filter(m => m.online).length} online • {roomMembers.length} total • {messages.length} messages
                </span>
              </div>
            </div>

            {/* Messages Area */}
            <div 
              ref={messagesContainerRef}
              onScroll={handleScroll}
              style={{ 
                flex: 1,
                padding: "15px",
                overflowY: "auto",
                backgroundColor: "#fafafa",
                display: "flex",
                flexDirection: "column"
              }}
            >
              {/* Loading indicator for message history */}
              {loadingHistory && (
                <div style={{ 
                  textAlign: "center", 
                  color: "#666",
                  padding: "10px",
                  fontSize: "0.9rem"
                }}>
                  Loading older messages...
                </div>
              )}

              {messages.length === 0 && !loadingHistory ? (
                <div style={{ 
                  textAlign: "center", 
                  color: "#999",
                  fontStyle: "italic",
                  marginTop: "20px",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  {isConnected ? "No messages yet. Start the conversation!" : "Connecting to chat..."}
                </div>
              ) : (
                messages.map((msg, index) => {
                  const previousMsg = messages[index - 1];
                  const isGrouped = shouldGroupMessages(msg, previousMsg);
                  
                  return (
                    <div 
                      key={msg._id || index} 
                      style={{ 
                        marginBottom: isGrouped ? "2px" : "12px",
                      }}
                    >
                      {msg.type === "system" ? (
                        <div style={{ 
                          textAlign: "center",
                          margin: "8px 0"
                        }}>
                          <span style={{
                            backgroundColor: "#e3f2fd",
                            color: "#1976d2",
                            padding: "4px 12px",
                            borderRadius: "12px",
                            fontSize: "0.8rem",
                            fontStyle: "italic"
                          }}>
                            {msg.text}
                          </span>
                        </div>
                      ) : (
                        <div style={{ 
                          display: "flex",
                          flexDirection: "column",
                          maxWidth: "80%",
                          marginLeft: msg.userId === currentUser?.id ? "auto" : "0"
                        }}>
                          {!isGrouped && (
                            <div style={{ 
                              display: "flex", 
                              justifyContent: "space-between",
                              fontSize: "0.75rem",
                              color: "#666",
                              marginBottom: "2px",
                              padding: "0 8px"
                            }}>
                              <strong>{msg.author}</strong>
                              <span>{formatMessageTime(msg.timestamp || msg.createdAt)}</span>
                            </div>
                          )}
                          <div style={{ 
                            backgroundColor: msg.userId === currentUser?.id ? "#007bff" : "#f0f0f0",
                            color: msg.userId === currentUser?.id ? "white" : "black",
                            padding: isGrouped ? "4px 12px" : "8px 12px",
                            borderRadius: "12px",
                            wordWrap: "break-word",
                            marginTop: isGrouped ? "0" : "4px"
                          }}>
                            {msg.text}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form onSubmit={sendMessage} style={{ 
              padding: "15px",
              borderTop: "1px solid #e0e0e0",
              backgroundColor: "white"
            }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={isConnected ? "Type a message..." : "Connecting..."}
                    disabled={!isConnected}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1px solid #ddd",
                      borderRadius: "20px",
                      fontSize: "0.9rem",
                      outline: "none"
                    }}
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!newMessage.trim() || !isConnected}
                  style={{
                    backgroundColor: newMessage.trim() && isConnected ? "#007bff" : "#ccc",
                    color: "white",
                    border: "none",
                    padding: "10px 20px",
                    borderRadius: "20px",
                    cursor: newMessage.trim() && isConnected ? "pointer" : "not-allowed",
                    fontSize: "0.9rem",
                    fontWeight: "500"
                  }}
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}