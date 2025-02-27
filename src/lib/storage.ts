import { auth, db } from './firebase';
import { 
  collection, 
  query, 
  getDocs, 
  setDoc,
  doc,
  orderBy,
  serverTimestamp,
  writeBatch,
  deleteDoc,
  where,
  onSnapshot
} from 'firebase/firestore';
import type { Chat } from '../types';

const DEFAULT_CHAT: Chat = {
  id: 'default',
  name: 'New Chat',
  messages: [],
  createdAt: new Date()
};

export const loadChatsFromStorage = async (userId?: string, onUpdate?: (chats: Chat[]) => void): Promise<Chat[]> => {
  try {
    if (userId) {
      console.log('Loading chats for user:', userId);
      // Load from Firebase if user is authenticated
      const chatsRef = collection(db, 'users', userId, 'chats');
      const q = query(
        chatsRef,
        where('deleted', '==', false),
        orderBy('createdAt', 'desc')
      );
      
      // Set up real-time listener if onUpdate is provided
      if (onUpdate) {
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const chats = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'New Chat',
            messages: doc.data().messages || [],
            createdAt: doc.data().createdAt?.toDate() || new Date()
          }));
          onUpdate(chats);
        }, (error) => {
          console.error('Error in chat listener:', error);
        });
        
        // Return unsubscribe function for cleanup
        return unsubscribe;
      }

      const querySnapshot = await getDocs(q);
      console.log('Loaded chats from Firebase:', querySnapshot.size);
      
      if (querySnapshot.empty) {
        // Create a default chat for new users
        const defaultChatId = crypto.randomUUID();
        const newChatRef = doc(db, 'users', userId, 'chats', defaultChatId);
        await setDoc(newChatRef, {
          name: 'New Chat',
          messages: [],
          createdAt: serverTimestamp(),
          deleted: false
        });
        console.log('Created default chat for new user');
        return [{ ...DEFAULT_CHAT, id: defaultChatId }];
      }

      const chats = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || 'New Chat',
        messages: doc.data().messages || [],
        createdAt: doc.data().createdAt?.toDate() || new Date()
      }));
      console.log('Parsed chats:', chats.length);
      return chats;
    }

    // For guest users, use local storage
    const storedChats = localStorage.getItem('guest_chats');
    if (storedChats) {
      return JSON.parse(storedChats);
    }
  } catch (error) {
    console.error('Error loading chats:', error);
  }

  return [DEFAULT_CHAT];
};

export const saveChatsToStorage = async (chats: Chat[], userId?: string) => {
  try {
    if (userId) {
      console.log('Saving chats for user:', userId);
      // Save each chat to Firestore using batch write
      const batch = writeBatch(db);
      
      // Update all chats
      chats.forEach(chat => {
        if (!chat.id || (chat.id === 'default' && chat.messages.length === 0)) return;
        
        // Use the chat's existing ID for the document
        const chatRef = doc(db, 'users', userId, 'chats', chat.id);
        batch.set(chatRef, {
          name: chat.name,
          messages: chat.messages,
          createdAt: serverTimestamp(),
          deleted: false
        }, { merge: true });
      });

      await batch.commit();
      console.log('Successfully saved chats to Firebase');
    } else {
      // For guest users, save to local storage
      localStorage.setItem('guest_chats', JSON.stringify(chats));
    }
  } catch (error) {
    console.error('Error saving chats:', error);
    // Fallback to local storage on error
    localStorage.setItem('guest_chats', JSON.stringify(chats));
  }
};

export const clearChatsFromStorage = async (userId?: string) => {
  try {
    if (userId) {
      console.log('Clearing chats for user:', userId);
      const chatsRef = collection(db, 'users', userId, 'chats');
      const querySnapshot = await getDocs(chatsRef);
      
      const batch = writeBatch(db);
      querySnapshot.docs.forEach((doc) => {
        batch.set(doc.ref, { deleted: true }, { merge: true });
      });
      
      await batch.commit();
      console.log('Successfully marked chats as deleted in Firebase');
    }
    
    // Always clear local storage
    localStorage.removeItem('guest_chats');
  } catch (error) {
    console.error('Error clearing chats:', error);
    localStorage.removeItem('guest_chats');
  }
};

export const transferGuestChats = async (guestChats: Chat[]) => {
  try {
    const user = auth.currentUser;
    if (!user || !guestChats.length) return false;

    console.log('Transferring guest chats for user:', user.uid);
    const batch = writeBatch(db);
    
    for (const chat of guestChats) {
      if (chat.messages.length === 0) continue;
      
      const chatRef = doc(collection(db, 'users', user.uid, 'chats'));
      batch.set(chatRef, {
        name: chat.name,
        messages: chat.messages,
        createdAt: serverTimestamp(),
        deleted: false
      });
    }

    await batch.commit();
    console.log('Successfully transferred guest chats to Firebase');
    localStorage.removeItem('guest_chats');
    return true;
  } catch (error) {
    console.error('Error transferring guest chats:', error);
    return false;
  }
};